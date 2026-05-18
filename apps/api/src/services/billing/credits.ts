/**
 * Pay-As-You-Go credit wallet service (#282).
 *
 * Credits are denominated in USD cents to avoid floating-point drift.
 * Debits happen atomically via a Postgres UPDATE … RETURNING that enforces
 * balance >= 0 (optimistic lock-free thanks to FOR UPDATE in the CHECK).
 */

import { eq, sql, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { creditBalances, creditTransactions } from '../../db/schema/credit-balances.js';
import { AppError } from '../../lib/app-error.js';

// ─── Cost table (cents per unit) ──────────────────────────────────────────────

export const CREDIT_COSTS = {
  email:    0.02,   // $0.0002 / email  = 0.02 cents
  sms:      0.75,   // $0.0075 / SMS segment
  whatsapp: 1.00,   // $0.01   / message
  voice:    2.00,   // $0.02   / minute (approx)
  ai:       0.10,   // $0.001  / 1k tokens (Haiku approximate)
} as const;

export type CreditProduct = keyof typeof CREDIT_COSTS;

// ─── Get balance ──────────────────────────────────────────────────────────────

export async function getBalance(orgId: string): Promise<{ balanceCents: number; balanceUsd: number }> {
  const [row] = await db.select().from(creditBalances)
    .where(eq(creditBalances.orgId, orgId)).limit(1);
  const cents = Number(row?.balanceCents ?? 0);
  return { balanceCents: cents, balanceUsd: cents / 100 };
}

// ─── Add credits (purchase) ───────────────────────────────────────────────────

export async function addCredits(
  orgId: string,
  amountCents: number,
  referenceId?: string,
  description?: string,
): Promise<{ newBalanceCents: number }> {
  return db.transaction(async (tx) => {
    // Upsert balance row
    const [balance] = await tx.insert(creditBalances).values({
      orgId,
      balanceCents: String(amountCents),
      totalPurchasedCents: String(amountCents),
    })
      .onConflictDoUpdate({
        target: creditBalances.orgId,
        set: {
          balanceCents: sql`credit_balances.balance_cents + ${amountCents}`,
          totalPurchasedCents: sql`credit_balances.total_purchased_cents + ${amountCents}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.insert(creditTransactions).values({
      orgId,
      type: 'purchase',
      amountCents: String(amountCents),
      balanceAfterCents: balance!.balanceCents,
      referenceId,
      referenceType: 'payment_intent',
      description: description ?? `Credit purchase: ${amountCents} cents`,
    });

    return { newBalanceCents: Number(balance!.balanceCents) };
  });
}

// ─── Deduct credits ───────────────────────────────────────────────────────────

export async function deductCredits(
  orgId: string,
  amountCents: number,
  product: CreditProduct,
  referenceId?: string,
  description?: string,
): Promise<{ newBalanceCents: number }> {
  return db.transaction(async (tx) => {
    const [balance] = await tx
      .update(creditBalances)
      .set({
        balanceCents: sql`credit_balances.balance_cents - ${amountCents}`,
        totalConsumedCents: sql`credit_balances.total_consumed_cents + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(creditBalances.orgId, orgId),
        sql`credit_balances.balance_cents >= ${amountCents}`,
      ))
      .returning();

    if (!balance) {
      throw AppError.badRequest('Insufficient credit balance');
    }

    await tx.insert(creditTransactions).values({
      orgId,
      type: 'deduction',
      amountCents: String(-amountCents),
      balanceAfterCents: balance.balanceCents,
      referenceId,
      referenceType: 'send',
      product,
      description: description ?? `${product} send: ${amountCents} cents`,
    });

    return { newBalanceCents: Number(balance.balanceCents) };
  });
}

// ─── Check sufficient credits ─────────────────────────────────────────────────

export async function checkSufficientCredits(orgId: string, estimatedCents: number): Promise<boolean> {
  const { balanceCents } = await getBalance(orgId);
  return balanceCents >= estimatedCents;
}

// ─── Estimate cost ────────────────────────────────────────────────────────────

export function estimateCost(product: CreditProduct, quantity: number): number {
  return Math.ceil(CREDIT_COSTS[product] * quantity);
}

// ─── Refund credits ───────────────────────────────────────────────────────────

export async function refundCredits(
  orgId: string,
  amountCents: number,
  referenceId?: string,
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [balance] = await tx.update(creditBalances)
      .set({
        balanceCents: sql`credit_balances.balance_cents + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(creditBalances.orgId, orgId))
      .returning();

    if (!balance) return;

    await tx.insert(creditTransactions).values({
      orgId,
      type: 'refund',
      amountCents: String(amountCents),
      balanceAfterCents: balance.balanceCents,
      referenceId,
      description: reason ?? `Refund: ${amountCents} cents`,
    });
  });
}

// ─── Transaction history ──────────────────────────────────────────────────────

export async function getTransactionHistory(
  orgId: string,
  limit = 50,
  offset = 0,
) {
  return db.select().from(creditTransactions)
    .where(eq(creditTransactions.orgId, orgId))
    .orderBy(sql`created_at DESC`)
    .limit(limit)
    .offset(offset);
}
