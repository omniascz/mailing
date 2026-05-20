/**
 * Customer subscriptions service — Commerce Hub (#313).
 *
 * Lifecycle: create → active → (upgrade | downgrade | pause/resume) → cancel.
 * Every plan change is logged in `subscription_changes` with proration.
 *
 * The worker cron calls `runDueInvoiceGeneration()` to generate invoices for
 * all subscriptions whose `nextInvoiceAt` has elapsed.
 */

import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  subscriptions,
  subscriptionChanges,
  type Subscription,
  type SubscriptionLineItem,
} from '../../db/schema/subscriptions.js';
import { AppError } from '../../lib/app-error.js';
import { createInvoice } from './invoicing.js';
import type { LineItem } from './products.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeMrr(
  lineItems: SubscriptionLineItem[],
  interval: string,
  intervalCount: number,
): number {
  const periodTotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const monthsPerPeriod =
    (
      {
        day: 1 / 30,
        week: 7 / 30,
        month: 1,
        quarter: 3,
        year: 12,
      } as Record<string, number>
    )[interval] ?? 1;
  const totalMonths = monthsPerPeriod * intervalCount;
  if (totalMonths <= 0) return 0;
  return Math.round((periodTotal / totalMonths) * 100) / 100;
}

function addInterval(base: Date, interval: string, count: number): Date {
  const d = new Date(base);
  switch (interval) {
    case 'day':
      d.setUTCDate(d.getUTCDate() + count);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() + 7 * count);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + count);
      break;
    case 'quarter':
      d.setUTCMonth(d.getUTCMonth() + 3 * count);
      break;
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + count);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() + count);
      break;
  }
  return d;
}

async function nextSubscriptionNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = (await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM subscriptions WHERE org_id = ${orgId}::uuid AND EXTRACT(YEAR FROM created_at) = ${year}`,
  )) as unknown as Array<{ count: string }>;
  const count = Number(rows[0]?.count ?? '0') + 1;
  return `SUB-${year}-${String(count).padStart(6, '0')}`;
}

function toInvoiceLineItems(items: SubscriptionLineItem[]): LineItem[] {
  return items.map(
    (li) =>
      ({
        productId: li.productId,
        sku: li.sku ?? 'SUBSCRIPTION',
        name: li.description,
        description: li.description,
        qty: li.quantity,
        unitPrice: li.unitPrice,
        total: Math.round(li.quantity * li.unitPrice * 100) / 100,
        taxRate: li.taxRate ?? 0,
        recurring: true,
      }) as LineItem,
  );
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateSubscriptionInput {
  contactId?: string;
  dealId?: string;
  currency?: string;
  lineItems: SubscriptionLineItem[];
  billingInterval?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  billingIntervalCount?: number;
  billingAnchor?: number;
  startDate?: Date;
  trialEndsAt?: Date;
  endsAt?: Date;
  stripeSubscriptionId?: string;
  metadata?: Record<string, unknown>;
}

export async function createSubscription(
  orgId: string,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  if (!input.lineItems?.length) throw AppError.badRequest('lineItems required');

  const interval = input.billingInterval ?? 'month';
  const intervalCount = input.billingIntervalCount ?? 1;
  const start = input.startDate ?? new Date();
  const periodEnd = addInterval(start, interval, intervalCount);
  const mrr = computeMrr(input.lineItems, interval, intervalCount);
  const subNumber = await nextSubscriptionNumber(orgId);
  const status = input.trialEndsAt && input.trialEndsAt > new Date() ? 'trialing' : 'active';

  const inserted = await db
    .insert(subscriptions)
    .values({
      orgId,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      subscriptionNumber: subNumber,
      status,
      currency: input.currency ?? 'USD',
      lineItems: input.lineItems,
      mrr: String(mrr),
      billingInterval: interval,
      billingIntervalCount: intervalCount,
      billingAnchor: input.billingAnchor ?? null,
      startDate: start,
      trialEndsAt: input.trialEndsAt ?? null,
      endsAt: input.endsAt ?? null,
      currentPeriodStart: start,
      currentPeriodEnd: periodEnd,
      nextInvoiceAt: input.trialEndsAt && input.trialEndsAt > start ? input.trialEndsAt : start,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();
  const row = inserted[0];
  if (!row) throw AppError.internal('Failed to create subscription');

  await db.insert(subscriptionChanges).values({
    orgId,
    subscriptionId: row.id,
    changeType: 'plan_swap',
    previousLineItems: [],
    newLineItems: input.lineItems,
    previousMrr: '0',
    newMrr: String(mrr),
    prorationAmount: '0',
    effectiveAt: start,
  });

  try {
    const { onApiEvent } = await import('../workflows/triggers.js');
    if (row.contactId) {
      await onApiEvent(orgId, row.contactId, 'subscription_created', {
        subscriptionId: row.id,
        subscriptionNumber: row.subscriptionNumber,
        mrr,
        currency: row.currency,
      });
    }
  } catch {
    /* non-fatal */
  }

  return row;
}

export async function getSubscription(orgId: string, id: string): Promise<Subscription> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)));
  if (!row || row.deletedAt) throw AppError.notFound('Subscription not found');
  return row;
}

export async function listSubscriptions(
  orgId: string,
  opts?: { status?: string; contactId?: string; limit?: number },
): Promise<Subscription[]> {
  const filters = [eq(subscriptions.orgId, orgId), sql`${subscriptions.deletedAt} IS NULL`];
  if (opts?.status) filters.push(eq(subscriptions.status, opts.status));
  if (opts?.contactId) filters.push(eq(subscriptions.contactId, opts.contactId));

  return db
    .select()
    .from(subscriptions)
    .where(and(...filters))
    .limit(opts?.limit ?? 100);
}

// ─── Proration ────────────────────────────────────────────────────────────────

/**
 * Proration credit (positive = customer owes, negative = refund owed) when
 * switching plans mid-cycle. Uses straight-line day-prorate.
 */
export function computeProration(
  oldItems: SubscriptionLineItem[],
  newItems: SubscriptionLineItem[],
  periodStart: Date,
  periodEnd: Date,
  changeAt: Date,
): number {
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (periodMs <= 0) return 0;
  const remainingMs = Math.max(0, periodEnd.getTime() - changeAt.getTime());
  const fraction = remainingMs / periodMs;

  const oldTotal = oldItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const newTotal = newItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const delta = (newTotal - oldTotal) * fraction;
  return Math.round(delta * 100) / 100;
}

// ─── Upgrade / Downgrade / Quantity change ───────────────────────────────────

export interface UpdateSubscriptionInput {
  lineItems: SubscriptionLineItem[];
  /** immediate → apply now + proration invoice; next_period → apply at period end */
  effective?: 'immediate' | 'next_period';
  changedByUserId?: string;
  reason?: string;
}

export async function updateSubscription(
  orgId: string,
  id: string,
  input: UpdateSubscriptionInput,
): Promise<Subscription> {
  const sub = await getSubscription(orgId, id);
  if (['canceled', 'expired'].includes(sub.status)) {
    throw AppError.badRequest('Cannot modify a canceled/expired subscription');
  }
  if (!input.lineItems?.length) throw AppError.badRequest('lineItems required');

  const now = new Date();
  const effective = input.effective ?? 'immediate';
  const prevMrr = Number(sub.mrr);
  const newMrr = computeMrr(input.lineItems, sub.billingInterval, sub.billingIntervalCount);
  const diff = newMrr - prevMrr;
  const changeType = diff > 0 ? 'upgrade' : diff < 0 ? 'downgrade' : 'quantity_change';

  const effectiveAt = effective === 'immediate' ? now : sub.currentPeriodEnd;
  let proration = 0;
  let prorationInvoiceId: string | null = null;

  if (effective === 'immediate') {
    proration = computeProration(
      sub.lineItems,
      input.lineItems,
      sub.currentPeriodStart,
      sub.currentPeriodEnd,
      now,
    );

    if (Math.abs(proration) > 0.01 && sub.contactId) {
      try {
        const prorationLineItems: LineItem[] = [
          {
            sku: 'PRORATION',
            name: `Proration for ${sub.subscriptionNumber}`,
            description: input.reason ?? `Plan change ${sub.subscriptionNumber}`,
            qty: 1,
            unitPrice: proration,
            total: proration,
          },
        ];
        const inv = await createInvoice(orgId, {
          contactId: sub.contactId,
          currency: sub.currency,
          lineItems: prorationLineItems,
          notes: input.reason ?? 'Subscription plan change proration',
        });
        prorationInvoiceId = inv?.id ?? null;
      } catch {
        /* non-fatal */
      }
    }
  }

  const patch: Record<string, unknown> = { updatedAt: now };
  if (effective === 'immediate') {
    patch.lineItems = input.lineItems;
    patch.mrr = String(newMrr);
  }

  const updatedRows = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)))
    .returning();
  const updated = updatedRows[0];
  if (!updated) throw AppError.notFound('Subscription not found');

  await db.insert(subscriptionChanges).values({
    orgId,
    subscriptionId: id,
    changeType,
    previousLineItems: sub.lineItems,
    newLineItems: input.lineItems,
    previousMrr: String(prevMrr),
    newMrr: String(newMrr),
    prorationAmount: String(proration),
    prorationInvoiceId,
    effectiveAt,
    changedByUserId: input.changedByUserId ?? null,
    metadata: input.reason ? { reason: input.reason } : {},
  });

  return updated;
}

// ─── Pause / Resume ──────────────────────────────────────────────────────────

export async function pauseSubscription(
  orgId: string,
  id: string,
  userId?: string,
): Promise<Subscription> {
  const sub = await getSubscription(orgId, id);
  if (sub.status !== 'active' && sub.status !== 'trialing') {
    throw AppError.badRequest(`Cannot pause from status=${sub.status}`);
  }

  const pausedRows = await db
    .update(subscriptions)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)))
    .returning();
  const row = pausedRows[0];
  if (!row) throw AppError.notFound('Subscription not found');

  await db.insert(subscriptionChanges).values({
    orgId,
    subscriptionId: id,
    changeType: 'pause',
    previousLineItems: sub.lineItems,
    newLineItems: sub.lineItems,
    previousMrr: sub.mrr,
    newMrr: sub.mrr,
    prorationAmount: '0',
    effectiveAt: new Date(),
    changedByUserId: userId ?? null,
  });
  return row;
}

export async function resumeSubscription(
  orgId: string,
  id: string,
  userId?: string,
): Promise<Subscription> {
  const sub = await getSubscription(orgId, id);
  if (sub.status !== 'paused') throw AppError.badRequest('Subscription is not paused');

  const now = new Date();
  const nextInvoice = now > sub.currentPeriodEnd ? now : sub.currentPeriodEnd;
  const resumedRows = await db
    .update(subscriptions)
    .set({ status: 'active', nextInvoiceAt: nextInvoice, updatedAt: now })
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)))
    .returning();
  const row = resumedRows[0];
  if (!row) throw AppError.notFound('Subscription not found');

  await db.insert(subscriptionChanges).values({
    orgId,
    subscriptionId: id,
    changeType: 'resume',
    previousLineItems: sub.lineItems,
    newLineItems: sub.lineItems,
    previousMrr: sub.mrr,
    newMrr: sub.mrr,
    prorationAmount: '0',
    effectiveAt: now,
    changedByUserId: userId ?? null,
  });
  return row;
}

// ─── Cancel / Reactivate ─────────────────────────────────────────────────────

export interface CancelSubscriptionInput {
  when?: 'immediate' | 'period_end';
  reason?: string;
  changedByUserId?: string;
}

export async function cancelSubscription(
  orgId: string,
  id: string,
  input?: CancelSubscriptionInput,
): Promise<Subscription> {
  const sub = await getSubscription(orgId, id);
  if (sub.status === 'canceled') throw AppError.badRequest('Already canceled');
  const when = input?.when ?? 'period_end';
  const now = new Date();

  const patch: Record<string, unknown> = {
    cancelReason: input?.reason ?? null,
    updatedAt: now,
  };
  if (when === 'immediate') {
    patch.status = 'canceled';
    patch.canceledAt = now;
    patch.mrr = '0';
  } else {
    patch.cancelAt = sub.currentPeriodEnd;
  }

  const canceledRows = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)))
    .returning();
  const row = canceledRows[0];
  if (!row) throw AppError.notFound('Subscription not found');

  await db.insert(subscriptionChanges).values({
    orgId,
    subscriptionId: id,
    changeType: 'cancel',
    previousLineItems: sub.lineItems,
    newLineItems: sub.lineItems,
    previousMrr: sub.mrr,
    newMrr: when === 'immediate' ? '0' : sub.mrr,
    prorationAmount: '0',
    effectiveAt: when === 'immediate' ? now : sub.currentPeriodEnd,
    changedByUserId: input?.changedByUserId ?? null,
    metadata: input?.reason ? { reason: input.reason } : {},
  });

  try {
    const { onApiEvent } = await import('../workflows/triggers.js');
    if (row.contactId) {
      await onApiEvent(orgId, row.contactId, 'subscription_canceled', {
        subscriptionId: row.id,
        subscriptionNumber: row.subscriptionNumber,
        when,
        reason: input?.reason,
      });
    }
  } catch {
    /* non-fatal */
  }

  return row;
}

export async function reactivateSubscription(
  orgId: string,
  id: string,
  userId?: string,
): Promise<Subscription> {
  const sub = await getSubscription(orgId, id);
  if (!sub.cancelAt && sub.status !== 'canceled') {
    throw AppError.badRequest('Subscription is not scheduled for cancellation');
  }

  const reactRows = await db
    .update(subscriptions)
    .set({
      status: 'active',
      cancelAt: null,
      canceledAt: null,
      cancelReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)))
    .returning();
  const row = reactRows[0];
  if (!row) throw AppError.notFound('Subscription not found');

  await db.insert(subscriptionChanges).values({
    orgId,
    subscriptionId: id,
    changeType: 'reactivate',
    previousLineItems: sub.lineItems,
    newLineItems: sub.lineItems,
    previousMrr: sub.mrr,
    newMrr: sub.mrr,
    prorationAmount: '0',
    effectiveAt: new Date(),
    changedByUserId: userId ?? null,
  });
  return row;
}

// ─── Invoice generation (worker cron) ────────────────────────────────────────

/**
 * Generate the next invoice for a subscription and advance its period.
 * Idempotent: if `nextInvoiceAt` is still in the future, returns null.
 */
export async function generateNextInvoice(
  orgId: string,
  subscriptionId: string,
): Promise<{ invoiceId: string; periodStart: Date; periodEnd: Date } | null> {
  const sub = await getSubscription(orgId, subscriptionId);
  if (sub.status !== 'active' && sub.status !== 'past_due') return null;
  const now = new Date();
  if (sub.nextInvoiceAt > now) return null;

  const invoiceLineItems = toInvoiceLineItems(sub.lineItems);
  const taxRate = sub.lineItems[0]?.taxRate ?? 0;
  const dueDate = new Date(now.getTime() + 14 * 86_400_000);

  const inv = await createInvoice(orgId, {
    contactId: sub.contactId ?? undefined,
    dealId: sub.dealId ?? undefined,
    currency: sub.currency,
    lineItems: invoiceLineItems,
    taxRate,
    dueDate,
    notes: `Subscription ${sub.subscriptionNumber} — period ${sub.currentPeriodStart.toISOString().slice(0, 10)} to ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`,
  });
  if (!inv) throw AppError.internal('Failed to create invoice');

  const nextPeriodStart = sub.currentPeriodEnd;
  const nextPeriodEnd = addInterval(nextPeriodStart, sub.billingInterval, sub.billingIntervalCount);

  // If a scheduled cancellation hits this period, expire rather than rolling.
  if (sub.cancelAt && sub.cancelAt <= nextPeriodStart) {
    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        canceledAt: now,
        mrr: '0',
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));
  } else {
    await db
      .update(subscriptions)
      .set({
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        nextInvoiceAt: nextPeriodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));
  }

  return { invoiceId: inv.id, periodStart: nextPeriodStart, periodEnd: nextPeriodEnd };
}

/**
 * Scan all subscriptions whose next invoice is due and generate them.
 * Called by the subscription-billing worker every 5 minutes.
 */
export async function runDueInvoiceGeneration(
  limit = 100,
): Promise<{ processed: number; generated: number; errors: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        lte(subscriptions.nextInvoiceAt, now),
        sql`${subscriptions.status} IN ('active','past_due')`,
        sql`${subscriptions.deletedAt} IS NULL`,
      ),
    )
    .limit(limit);

  let generated = 0;
  let errors = 0;
  for (const s of due) {
    try {
      const r = await generateNextInvoice(s.orgId, s.id);
      if (r) generated++;
    } catch {
      errors++;
    }
  }
  return { processed: due.length, generated, errors };
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function listSubscriptionChanges(orgId: string, subscriptionId: string) {
  return db
    .select()
    .from(subscriptionChanges)
    .where(
      and(
        eq(subscriptionChanges.orgId, orgId),
        eq(subscriptionChanges.subscriptionId, subscriptionId),
      ),
    );
}

export async function softDeleteSubscription(orgId: string, id: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.id, id)));
}
