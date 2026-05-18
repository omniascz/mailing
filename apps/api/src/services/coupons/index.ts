/**
 * Unique coupon codes — generate batches of one-time codes, assign to contacts
 * via merge tag (`{{coupon}}`), then track redemption + revenue.
 */

import crypto from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  couponBatches, couponCodes,
  type CouponBatch, type CouponCode,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len = 10): string {
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

export async function createBatch(orgId: string, input: {
  name: string; codePrefix?: string; discountType?: 'percent' | 'fixed';
  discountValue: number; expiresAt?: Date; quantity: number;
}): Promise<{ batch: CouponBatch; generated: number }> {
  if (input.quantity < 1 || input.quantity > 100_000) {
    throw AppError.badRequest('Quantity must be 1–100000');
  }
  const [batch] = await db.insert(couponBatches).values({
    orgId, name: input.name,
    codePrefix: input.codePrefix ?? '',
    discountType: input.discountType ?? 'percent',
    discountValue: String(input.discountValue),
    expiresAt: input.expiresAt,
    totalCodes: input.quantity,
  }).returning();

  const seen = new Set<string>();
  const rows = [];
  while (rows.length < input.quantity) {
    const code = (input.codePrefix ?? '') + randomCode(10);
    if (seen.has(code)) continue;
    seen.add(code);
    rows.push({ batchId: batch!.id, orgId, code });
  }
  // Insert in chunks of 1000.
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(couponCodes).values(rows.slice(i, i + 1000)).onConflictDoNothing();
  }
  return { batch: batch!, generated: rows.length };
}

export async function listBatches(orgId: string): Promise<CouponBatch[]> {
  return db.select().from(couponBatches).where(eq(couponBatches.orgId, orgId));
}

/** Pull the next unassigned code from a batch and bind it to a contact. */
export async function assignCodeToContact(
  orgId: string, batchId: string, contactId: string,
): Promise<CouponCode> {
  const [taken] = await db.execute<{ id: string }>(sql`
    UPDATE coupon_codes SET assigned_to = ${contactId}::uuid, assigned_at = now()
    WHERE id = (
      SELECT id FROM coupon_codes
      WHERE batch_id = ${batchId}::uuid AND org_id = ${orgId}::uuid AND assigned_to IS NULL
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  if (!taken) throw AppError.badRequest('Batch exhausted');
  const [row] = await db.select().from(couponCodes).where(eq(couponCodes.id, taken.id)).limit(1);
  return row!;
}

export async function redeem(orgId: string, code: string, revenue?: number): Promise<CouponCode> {
  const [row] = await db.select().from(couponCodes)
    .where(and(eq(couponCodes.orgId, orgId), eq(couponCodes.code, code))).limit(1);
  if (!row) throw AppError.notFound('Coupon');
  if (row.redeemedAt) throw AppError.badRequest('Already redeemed');
  const [updated] = await db.update(couponCodes)
    .set({ redeemedAt: new Date(), revenue: revenue != null ? String(revenue) : null })
    .where(eq(couponCodes.id, row.id))
    .returning();
  await db.update(couponBatches)
    .set({ redeemedCount: sql`${couponBatches.redeemedCount} + 1` })
    .where(eq(couponBatches.id, row.batchId));
  return updated!;
}

export async function batchStats(orgId: string, batchId: string): Promise<{
  total: number; assigned: number; redeemed: number; revenue: number;
}> {
  const [row] = await db.execute<{ total: string; assigned: string; redeemed: string; revenue: string }>(sql`
    SELECT
      COUNT(*)::text AS total,
      COUNT(assigned_to)::text AS assigned,
      COUNT(redeemed_at)::text AS redeemed,
      COALESCE(SUM(revenue), 0)::text AS revenue
    FROM coupon_codes
    WHERE org_id = ${orgId}::uuid AND batch_id = ${batchId}::uuid
  `) as unknown as Array<{ total: string; assigned: string; redeemed: string; revenue: string }>;
  return {
    total: Number(row?.total ?? 0),
    assigned: Number(row?.assigned ?? 0),
    redeemed: Number(row?.redeemed ?? 0),
    revenue: Number(row?.revenue ?? 0),
  };
}

void isNull;
