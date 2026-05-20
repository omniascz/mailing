/**
 * Revenue schedule & recognition (#315).
 *
 * Purpose: accountants and finance need MRR / ARR plus GAAP-style deferred
 * revenue recognition (straight-line across the subscription period).
 *
 * An invoice line item is either:
 *   - one-time    → full amount recognised at `invoice.paid_at`
 *   - recurring   → amount divided evenly across the contract period and
 *                   booked month-by-month (revenue_schedule rows)
 *
 * This file computes the schedule rows, aggregates MRR/ARR, and exposes a
 * helper for cohort ARR movement (new / expansion / contraction / churn).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { invoices } from '../../db/schema/invoices.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isRecurring?: boolean;
  recurringPeriod?: 'monthly' | 'yearly';
  contractStart?: string; // ISO
  contractEnd?: string; // ISO
}

export interface RevenueScheduleRow {
  invoiceId: string;
  orgId: string;
  period: string; // YYYY-MM
  description: string;
  amount: number; // recognised this period
  currency: string;
  type: 'one_time' | 'subscription';
}

export interface MrrSnapshot {
  periodStart: Date;
  periodEnd: Date;
  mrr: number;
  arr: number; // mrr × 12
  currency: string;
  invoiceCount: number;
}

// ─── Schedule builder ─────────────────────────────────────────────────────────

function monthsBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur <= last) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/**
 * Build revenue-recognition rows for a single invoice.
 * One-time line items recognise in the invoice's paid month.
 * Subscription line items spread straight-line across contract months.
 */
export function buildScheduleForInvoice(inv: {
  id: string;
  orgId: string;
  currency: string;
  lineItems: LineItem[];
  paidAt: Date | null;
  createdAt: Date;
}): RevenueScheduleRow[] {
  const rows: RevenueScheduleRow[] = [];
  const effective = inv.paidAt ?? inv.createdAt;
  const effectiveKey = `${effective.getUTCFullYear()}-${String(effective.getUTCMonth() + 1).padStart(2, '0')}`;

  for (const li of inv.lineItems) {
    if (!li.isRecurring || !li.contractStart || !li.contractEnd) {
      rows.push({
        invoiceId: inv.id,
        orgId: inv.orgId,
        period: effectiveKey,
        description: li.description,
        amount: li.total,
        currency: inv.currency,
        type: 'one_time',
      });
      continue;
    }

    const months = monthsBetween(li.contractStart, li.contractEnd);
    if (months.length === 0) continue;
    const perMonth = li.total / months.length;
    for (const p of months) {
      rows.push({
        invoiceId: inv.id,
        orgId: inv.orgId,
        period: p,
        description: li.description,
        amount: Math.round(perMonth * 100) / 100,
        currency: inv.currency,
        type: 'subscription',
      });
    }
  }
  return rows;
}

// ─── MRR / ARR aggregates ─────────────────────────────────────────────────────

export async function computeMrrForPeriod(
  orgId: string,
  period: Date, // any date within the target month
): Promise<MrrSnapshot> {
  const periodStart = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
  const periodEnd = new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  const paid = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, 'paid')));

  let mrr = 0;
  let invoiceCount = 0;
  let currency = 'USD';

  for (const inv of paid) {
    const schedule = buildScheduleForInvoice({
      id: inv.id,
      orgId: inv.orgId,
      currency: inv.currency,
      lineItems: (inv.lineItems ?? []) as LineItem[],
      paidAt: inv.paidAt,
      createdAt: inv.createdAt,
    });
    const key = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`;
    const hit = schedule.filter((r) => r.period === key && r.type === 'subscription');
    if (hit.length) {
      invoiceCount += 1;
      for (const r of hit) mrr += r.amount;
      currency = inv.currency;
    }
  }

  const rounded = Math.round(mrr * 100) / 100;
  return {
    periodStart,
    periodEnd,
    mrr: rounded,
    arr: Math.round(rounded * 12 * 100) / 100,
    currency,
    invoiceCount,
  };
}

// ─── Cohort movement (new / expansion / churn) ───────────────────────────────

export interface MrrMovement {
  period: string;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnedMrr: number;
  netMrr: number;
}

export async function computeMrrMovement(orgId: string, currentPeriod: Date): Promise<MrrMovement> {
  const current = await computeMrrForPeriod(orgId, currentPeriod);
  const prevDate = new Date(
    Date.UTC(currentPeriod.getUTCFullYear(), currentPeriod.getUTCMonth() - 1, 15),
  );
  const previous = await computeMrrForPeriod(orgId, prevDate);

  const diff = current.mrr - previous.mrr;
  return {
    period: `${currentPeriod.getUTCFullYear()}-${String(currentPeriod.getUTCMonth() + 1).padStart(2, '0')}`,
    newMrr: diff > 0 && previous.invoiceCount < current.invoiceCount ? diff : 0,
    expansionMrr: diff > 0 && previous.invoiceCount >= current.invoiceCount ? diff : 0,
    contractionMrr: diff < 0 && current.invoiceCount >= previous.invoiceCount ? Math.abs(diff) : 0,
    churnedMrr: diff < 0 && current.invoiceCount < previous.invoiceCount ? Math.abs(diff) : 0,
    netMrr: diff,
  };
}

// ─── Deferred revenue balance (GAAP) ─────────────────────────────────────────

/**
 * Sum of all schedule rows after the given as-of date — i.e. revenue we've
 * collected in cash but not yet earned (still on the liability side).
 */
export async function computeDeferredRevenue(
  orgId: string,
  asOf: Date,
): Promise<{ deferred: number; currency: string }> {
  const paid = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, 'paid')));

  const asOfKey = `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, '0')}`;
  let deferred = 0;
  let currency = 'USD';

  for (const inv of paid) {
    currency = inv.currency;
    const schedule = buildScheduleForInvoice({
      id: inv.id,
      orgId: inv.orgId,
      currency: inv.currency,
      lineItems: (inv.lineItems ?? []) as LineItem[],
      paidAt: inv.paidAt,
      createdAt: inv.createdAt,
    });
    for (const row of schedule) {
      if (row.type === 'subscription' && row.period > asOfKey) {
        deferred += row.amount;
      }
    }
  }

  return { deferred: Math.round(deferred * 100) / 100, currency };
}
