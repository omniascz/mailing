/**
 * Quotes & Proposals (#308).
 * Full quote lifecycle: draft → send → sign → accept/reject.
 */

import { eq, and, desc, sql } from 'drizzle-orm';

import { db } from '../../db/client.js';
import { quotes } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { computeTotals, type LineItem } from './products.js';

// ── Quote number generation ───────────────────────────────────────────────────

async function nextQuoteNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*) as count FROM quotes WHERE org_id = ${orgId} AND EXTRACT(YEAR FROM created_at) = ${year}`,
  );
  const count = Number(result[0]?.count ?? 0) + 1;
  return `Q-${year}-${String(count).padStart(4, '0')}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listQuotes(
  orgId: string,
  opts?: { status?: string; dealId?: string; limit?: number },
) {
  const { and: a, eq: e } = await import('drizzle-orm');
  return db
    .select()
    .from(quotes)
    .where(
      opts?.dealId
        ? a(e(quotes.orgId, orgId), e(quotes.dealId, opts.dealId))
        : e(quotes.orgId, orgId),
    )
    .orderBy(desc(quotes.createdAt))
    .limit(opts?.limit ?? 50);
}

export async function getQuote(orgId: string, quoteId: string) {
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)));
  if (!row) throw AppError.notFound('Quote not found');
  return row;
}

export async function createQuote(
  orgId: string,
  input: {
    dealId?: string;
    contactId?: string;
    title: string;
    currency?: string;
    lineItems: LineItem[];
    taxRate?: number;
    validUntil?: Date;
    notes?: string;
    terms?: string;
  },
) {
  const quoteNumber = await nextQuoteNumber(orgId);
  const totals = computeTotals(input.lineItems, input.taxRate ?? 0);

  const [row] = await db
    .insert(quotes)
    .values({
      orgId,
      dealId: input.dealId,
      contactId: input.contactId,
      quoteNumber,
      title: input.title,
      currency: input.currency ?? 'USD',
      lineItems: input.lineItems,
      subtotal: String(totals.subtotal),
      discountTotal: String(totals.discountTotal),
      taxTotal: String(totals.taxTotal),
      total: String(totals.total),
      validUntil: input.validUntil,
      notes: input.notes,
      terms: input.terms,
    })
    .returning();
  return row!;
}

export async function updateQuote(
  orgId: string,
  quoteId: string,
  input: Partial<{
    title: string;
    lineItems: LineItem[];
    taxRate: number;
    currency: string;
    validUntil: Date;
    notes: string;
    terms: string;
    status: string;
  }>,
) {
  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (input.lineItems) {
    const totals = computeTotals(input.lineItems, input.taxRate ?? 0);
    Object.assign(patch, totals);
  }
  const [row] = await db
    .update(quotes)
    .set(patch)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)))
    .returning();
  if (!row) throw AppError.notFound('Quote not found');
  return row;
}

export async function deleteQuote(orgId: string, quoteId: string) {
  const [row] = await db
    .delete(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)))
    .returning({ id: quotes.id });
  if (!row) throw AppError.notFound('Quote not found');
}

export async function sendQuote(orgId: string, quoteId: string) {
  const [row] = await db
    .update(quotes)
    .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.orgId, orgId), eq(quotes.id, quoteId)))
    .returning();
  if (!row) throw AppError.notFound('Quote not found');
  return row;
}

// Public endpoint for contacts to view/sign (no auth, by token)
export async function getQuoteByToken(token: string) {
  const [row] = await db.select().from(quotes).where(eq(quotes.signatureToken, token));
  if (!row) throw AppError.notFound('Quote not found');
  if (row.validUntil && row.validUntil < new Date()) throw AppError.badRequest('Quote has expired');

  // Mark as viewed
  if (!row.viewedAt) {
    await db
      .update(quotes)
      .set({ viewedAt: new Date(), status: 'viewed', updatedAt: new Date() })
      .where(eq(quotes.id, row.id));
  }
  return row;
}

// Convert accepted quote to invoice
export async function convertQuoteToInvoice(orgId: string, quoteId: string, dueDate?: Date) {
  const quote = await getQuote(orgId, quoteId);
  const { createInvoice } = await import('./invoicing.js');
  return createInvoice(orgId, {
    dealId: quote.dealId ?? undefined,
    contactId: quote.contactId ?? undefined,
    title: quote.title,
    currency: quote.currency,
    lineItems: quote.lineItems as LineItem[],
    dueDate,
    notes: quote.notes ?? undefined,
  });
}
