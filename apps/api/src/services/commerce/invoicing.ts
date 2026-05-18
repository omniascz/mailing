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
  const [row] = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  if (!row) throw AppError.notFound('Invoice not found');
  return row;
}

export async function createInvoice(orgId: string, input: {
  dealId?: string;
  contactId?: string;
  title?: string;
  currency?: string;
  lineItems: LineItem[];
  taxRate?: number;
  dueDate?: Date;
  notes?: string;
}) {
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

export async function updateInvoice(orgId: string, invoiceId: string, input: Partial<{
  lineItems: LineItem[];
  taxRate: number;
  dueDate: Date;
  notes: string;
  status: string;
}>) {
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
    .where(and(
      eq(invoices.status, 'sent'),
      lte(invoices.dueDate, now),
    ));
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

export async function sendDueReminders() {
  const now = new Date();
  let sent = 0;

  for (const daysBefore of REMINDER_INTERVALS_DAYS) {
    const targetDate = new Date(now.getTime() + daysBefore * 86_400_000);
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    const dueSoon = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.status, 'sent'),
        sql`date_trunc('day', ${invoices.dueDate}) = ${targetDateStr}::date`,
      ));

    for (const invoice of dueSoon) {
      if (!invoice.contactId) continue;
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

        await db
          .update(invoices)
          .set({ remindersSent: invoice.remindersSent + 1, lastReminderAt: now, updatedAt: new Date() })
          .where(eq(invoices.id, invoice.id));
        sent++;
      } catch { /* non-fatal */ }
    }
  }
  return sent;
}
