/**
 * Invoicing (#311).
 * Full invoice lifecycle: draft → send → paid/overdue.
 * Automated reminders via BullMQ worker.
 */

import { eq, and, lte, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { invoices } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { computeTotals, type LineItem } from './products.js';

// ── Invoice number ────────────────────────────────────────────────────────────

async function nextInvoiceNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*) as count FROM invoices WHERE org_id = ${orgId} AND EXTRACT(YEAR FROM created_at) = ${year}`,
  );
  const count = Number(result[0]?.count ?? 0) + 1;
  return `INV-${year}-${String(count).padStart(4, '0')}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listInvoices(orgId: string, opts?: { status?: string; limit?: number }) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.orgId, orgId))
    .orderBy(desc(invoices.createdAt))
    .limit(opts?.limit ?? 50);
}

export async function getInvoice(orgId: string, invoiceId: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  if (!row) throw AppError.notFound('Invoice not found');
  return row;
}

export async function createInvoice(
  orgId: string,
  input: {
    dealId?: string;
    contactId?: string;
    title?: string;
    currency?: string;
    lineItems: LineItem[];
    taxRate?: number;
    dueDate?: Date;
    notes?: string;
  },
) {
  const invoiceNumber = await nextInvoiceNumber(orgId);
  const totals = computeTotals(input.lineItems, input.taxRate ?? 0);

  const [row] = await db
    .insert(invoices)
    .values({
      orgId,
      dealId: input.dealId,
      contactId: input.contactId,
      invoiceNumber,
      currency: input.currency ?? 'USD',
      lineItems: input.lineItems,
      subtotal: String(totals.subtotal),
      taxTotal: String(totals.taxTotal),
      total: String(totals.total),
      amountDue: String(totals.total),
      dueDate: input.dueDate,
      notes: input.notes,
    })
    .returning();
  return row!;
}

export async function updateInvoice(
  orgId: string,
  invoiceId: string,
  input: Partial<{
    lineItems: LineItem[];
    taxRate: number;
    dueDate: Date;
    notes: string;
    status: string;
  }>,
) {
  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (input.lineItems) {
    const totals = computeTotals(input.lineItems, input.taxRate ?? 0);
    Object.assign(patch, totals, { amountDue: String(totals.total) });
  }
  const [row] = await db
    .update(invoices)
    .set(patch)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .returning();
  if (!row) throw AppError.notFound('Invoice not found');
  return row;
}

export async function sendInvoice(orgId: string, invoiceId: string) {
  const [row] = await db
    .update(invoices)
    .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .returning();
  if (!row) throw AppError.notFound('Invoice not found');
  return row;
}

export async function voidInvoice(orgId: string, invoiceId: string) {
  const [row] = await db
    .update(invoices)
    .set({ status: 'void', voidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .returning();
  if (!row) throw AppError.notFound('Invoice not found');
  return row;
}

export async function markInvoicePaid(orgId: string, invoiceId: string, amountPaid?: number) {
  const invoice = await getInvoice(orgId, invoiceId);
  const paid = amountPaid ?? parseFloat(String(invoice.total));

  const [row] = await db
    .update(invoices)
    .set({
      status: 'paid',
      amountPaid: String(paid),
      amountDue: String(Math.max(0, parseFloat(String(invoice.total)) - paid)),
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId))
    .returning();
  return row;
}

// ── Overdue detection (called by reminder worker) ─────────────────────────────

export async function getOverdueInvoices() {
  const now = new Date();
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.status, 'sent'), lte(invoices.dueDate, now)));
}

export async function markOverdueInvoices() {
  const now = new Date();
  const result = await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(eq(invoices.status, 'sent'), lte(invoices.dueDate, now)))
    .returning({ id: invoices.id });
  return result.length;
}

// ── Reminder logic (called by worker) ────────────────────────────────────────

const REMINDER_INTERVALS_DAYS = [7, 3, 1]; // send reminders 7, 3, 1 days before due

/**
 * Send the reminders due today, at most one per invoice.
 *
 * The sweep used to select on the due date alone. It wrote `reminders_sent + 1`
 * and `last_reminder_at` afterwards and read neither back, so running it twice
 * in a day sent the reminder twice — measured against a real database: two
 * sweeps left `reminders_sent` at 2, five sweeps left it at 5. That is why the
 * invoice-reminder queue is the one cron in apps/workers with `attempts: 1`.
 *
 * Three decisions worth stating, because each had a plausible alternative.
 *
 * The predicate is "not reminded TODAY", not "never reminded". The ladder is
 * REMINDER_INTERVALS_DAYS = [7, 3, 1], so an invoice is meant to be chased
 * three times over its life. Gating on `reminders_sent = 0` would have made
 * the sweep idempotent by deleting two thirds of the feature. An invoice can
 * match at most one rung on any given day — its due date cannot be both
 * now+7 and now+3 — so "once per invoice per day" is exactly the invariant
 * the ladder needs.
 *
 * The mark is written BEFORE the send, as a conditional UPDATE that doubles as
 * the check: if it updates no row, someone already claimed this invoice today
 * and we move on. Claiming after the send would leave a window — send
 * succeeds, process dies, mark never written — in which the retry sends again,
 * and that window is exactly what the stuck-connection reaper widens by
 * killing a wedged backend mid-sweep. Claiming first inverts the failure: a
 * send that fails after the claim is not retried today. That is the side to
 * be wrong on. A duplicate payment chase to a customer who is not late is a
 * support incident; a missed 7-day nudge is followed by the 3-day and 1-day
 * ones. It also makes two sweeps running at once safe, which a read-then-write
 * check would not.
 *
 * The per-invoice failure stays non-fatal, but it stops being silent. It used
 * to be `catch { /* non-fatal *\/ }`, which is why a systemic outage looked
 * like a clean run. Letting it throw instead would abort the invoices behind
 * it and, now that the queue may retry, produce a retry that skips everything
 * already claimed and therefore fixes nothing — so the error is logged with
 * the invoice id and the loop carries on.
 *
 * The increment is `reminders_sent + 1` in SQL rather than a value read in
 * JavaScript, so two sweeps cannot both read 0 and both write 1.
 */
export async function sendDueReminders() {
  const now = new Date();
  // UTC, to match the date arithmetic below and the 08:00 UTC cron. Written as
  // an explicit `AT TIME ZONE 'UTC'` rather than date_trunc on the column,
  // because date_trunc over a timestamptz resolves in the session's time zone
  // and would make the boundary depend on how the connection was configured.
  const todayStartUtc = sql`(${now.toISOString().slice(0, 10)}::date AT TIME ZONE 'UTC')`;
  const notRemindedToday = sql`(${invoices.lastReminderAt} IS NULL OR ${invoices.lastReminderAt} < ${todayStartUtc})`;

  let sent = 0;
  let failed = 0;

  for (const daysBefore of REMINDER_INTERVALS_DAYS) {
    const targetDate = new Date(now.getTime() + daysBefore * 86_400_000);
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    const dueSoon = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'sent'),
          sql`date_trunc('day', ${invoices.dueDate}) = ${targetDateStr}::date`,
          notRemindedToday,
        ),
      );

    for (const invoice of dueSoon) {
      if (!invoice.contactId) continue;

      // Claim it. The same condition as the select, re-checked inside the
      // write, so the row is ours or it is nobody's.
      const claimed = await db
        .update(invoices)
        .set({
          remindersSent: sql`${invoices.remindersSent} + 1`,
          lastReminderAt: now,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoice.id), notRemindedToday))
        .returning({ id: invoices.id });

      if (claimed.length === 0) continue;

      try {
        // Fire workflow event so automated reminders can be configured
        const { onApiEvent } = await import('../workflows/triggers.js');
        await onApiEvent(invoice.orgId, invoice.contactId, 'invoice_reminder', {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate?.toISOString(),
          amountDue: invoice.amountDue,
          currency: invoice.currency,
          daysBefore,
        });
        sent++;
      } catch (err) {
        // Claimed but not sent: this invoice gets no reminder on this rung.
        // Loud, because the alternative was a clean-looking run.
        failed += 1;
        console.error(
          `[invoice-reminder] invoice ${invoice.id} (org ${invoice.orgId}) was claimed ` +
            `for the ${daysBefore}-day reminder but the workflow event failed; it will ` +
            `not be retried today: ${(err as Error).message}`,
        );
      }
    }
  }

  if (failed > 0) {
    console.error(`[invoice-reminder] ${sent} reminders sent, ${failed} claimed but not sent`);
  }
  return sent;
}
