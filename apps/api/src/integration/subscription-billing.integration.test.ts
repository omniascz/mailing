/**
 * What the subscription-billing cron does on its first successful tick.
 *
 * The worry was concrete: the cron runs every five minutes and is NOT behind
 * FEATURE_BEYOND_CORE, but the route it calls is, so it has been failing on 404
 * and `next_invoice_at` has never advanced. Turning the flag on therefore looks
 * like it releases a backlog — `runDueInvoiceGeneration(500)` firing 500
 * invoices a tick, unattended, forever.
 *
 * These cases are the measurement that decides it, and they exist so the
 * decision does not have to be re-derived from the code next time. Two of them
 * pin behaviour that is load-bearing for that decision and is easy to destroy
 * by accident:
 *
 *   - a due subscription advances by exactly ONE period per call, so a stale
 *     one catches up over N ticks rather than in one burst. Rewriting the
 *     per-subscription step into a catch-up loop would break this and look like
 *     an optimisation.
 *   - a generated invoice is a `draft` and stays inert: nothing marks it
 *     overdue, nothing fires a reminder, nothing sends it.
 *
 * The "there are no subscriptions at all" half of the argument is not asserted
 * here — a test that demands an empty table would fail the moment anyone seeds
 * a fixture, and the emptiness is a property of the deployment, not of the
 * code. It is recorded in apps/workers/src/jobs/subscription-billing.ts with
 * the reason it holds: the only producer of a row is behind the same flag as
 * the consumer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, contacts, invoices } from '../db/schema/index.js';
import { subscriptions } from '../db/schema/subscriptions.js';
import {
  createSubscription,
  generateNextInvoice,
  runDueInvoiceGeneration,
} from '../services/commerce/subscriptions.js';
import { markOverdueInvoices, sendDueReminders } from '../services/commerce/invoicing.js';

const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];
let orgId: string;
let contactId: string;

const LINE_ITEMS = [
  { description: 'Seat', quantity: 2, unitPrice: 25, currency: 'USD', taxRate: 0 },
];

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: `subs ${tag}`, slug: `subs-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
  orgIds.push(orgId);

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `subs-${tag}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
});

/** Drag a subscription's clock back so it is `periods` whole months overdue. */
async function backdate(subscriptionId: string, monthsAgo: number) {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - monthsAgo);
  const periodEnd = new Date(start);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  await db
    .update(subscriptions)
    .set({
      startDate: start,
      currentPeriodStart: start,
      currentPeriodEnd: periodEnd,
      nextInvoiceAt: start,
    })
    .where(eq(subscriptions.id, subscriptionId));
}

async function invoiceCount(): Promise<number> {
  const rows = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.orgId, orgId));
  return rows.length;
}

describe('the first successful tick', () => {
  it('generates nothing when no subscription is due', async () => {
    const before = await invoiceCount();
    const result = await runDueInvoiceGeneration(500);
    // Scoped globally by design (the cron is not per-org), so only assert that
    // OUR org gained nothing — another suite's fixture must not fail this.
    expect(await invoiceCount()).toBe(before);
    expect(result.errors).toBe(0);
  });

  it('a stale subscription advances ONE period per tick, not to now', async () => {
    const sub = await createSubscription(orgId, {
      contactId,
      lineItems: LINE_ITEMS,
      billingInterval: 'month',
      billingIntervalCount: 1,
    });
    // Four months behind: the shape that would produce a burst if the loop
    // caught up in a single call.
    await backdate(sub.id, 4);

    const before = await invoiceCount();
    const first = await generateNextInvoice(orgId, sub.id);
    expect(first, 'a due subscription must produce an invoice').not.toBeNull();
    expect(await invoiceCount(), 'exactly one invoice per call').toBe(before + 1);

    const [afterOne] = await db
      .select({ nextInvoiceAt: subscriptions.nextInvoiceAt })
      .from(subscriptions)
      .where(eq(subscriptions.id, sub.id));
    // Still in the past — three periods of catching up remain.
    expect(afterOne!.nextInvoiceAt.getTime(), 'next_invoice_at must not jump to now').toBeLessThan(
      Date.now(),
    );

    // A second call takes exactly one more period, and so on.
    await generateNextInvoice(orgId, sub.id);
    expect(await invoiceCount()).toBe(before + 2);
  });

  it('a subscription whose period has not elapsed produces nothing', async () => {
    const sub = await createSubscription(orgId, {
      contactId,
      lineItems: LINE_ITEMS,
      billingInterval: 'month',
    });
    // A fresh non-trial subscription bills in advance: next_invoice_at = start,
    // so it IS due once. Take that invoice, then the next one is a month away.
    await generateNextInvoice(orgId, sub.id);

    const before = await invoiceCount();
    const second = await generateNextInvoice(orgId, sub.id);
    expect(second, 'the next period is not due yet').toBeNull();
    expect(await invoiceCount()).toBe(before);
  });
});

describe('what a generated invoice does on its own', () => {
  it('is a draft, and nothing downstream acts on a draft', async () => {
    const sub = await createSubscription(orgId, {
      contactId,
      lineItems: LINE_ITEMS,
      billingInterval: 'month',
    });
    const generated = await generateNextInvoice(orgId, sub.id);
    expect(generated).not.toBeNull();

    const [inv] = await db
      .select({ status: invoices.status, sentAt: invoices.sentAt, dueDate: invoices.dueDate })
      .from(invoices)
      .where(eq(invoices.id, generated!.invoiceId));

    expect(inv!.status, 'createInvoice inserts a draft').toBe('draft');
    expect(inv!.sentAt, 'nothing was sent').toBeNull();

    // The two sweeps that could turn an invoice into an outward-facing event
    // both filter on status = 'sent', so a draft is invisible to them. Running
    // them here proves the draft is not picked up rather than asserting it from
    // reading the SQL.
    await markOverdueInvoices();
    await sendDueReminders();

    const [after] = await db
      .select({ status: invoices.status, remindersSent: invoices.remindersSent })
      .from(invoices)
      .where(eq(invoices.id, generated!.invoiceId));

    expect(after!.status, 'a draft must not be marked overdue').toBe('draft');
    expect(after!.remindersSent, 'a draft must not be reminded').toBe(0);
  });

  it('a cancelled subscription stops billing rather than accruing', async () => {
    const sub = await createSubscription(orgId, {
      contactId,
      lineItems: LINE_ITEMS,
      billingInterval: 'month',
    });
    await db.update(subscriptions).set({ status: 'canceled' }).where(eq(subscriptions.id, sub.id));

    const before = await invoiceCount();
    expect(await generateNextInvoice(orgId, sub.id)).toBeNull();
    expect(await invoiceCount()).toBe(before);
  });

  it('the per-tick limit caps subscriptions looked at, and the rest simply wait', async () => {
    const made: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await createSubscription(orgId, {
        contactId,
        lineItems: LINE_ITEMS,
        billingInterval: 'month',
      });
      made.push(s.id);
      await backdate(s.id, 2);
    }

    const before = await invoiceCount();
    // A limit smaller than the queue: two get invoiced, one waits.
    const result = await runDueInvoiceGeneration(2);
    expect(result.processed).toBeLessThanOrEqual(2);
    expect(await invoiceCount()).toBeLessThanOrEqual(before + 2);
    expect(result.errors).toBe(0);

    const stillDue = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, orgId), inArray(subscriptions.id, made)));
    expect(stillDue.length, 'nothing was destroyed by being skipped').toBe(3);
  });
});
