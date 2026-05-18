/**
 * Price-drop alerts — notify subscribers when a watched SKU drops below
 * the price they snapshotted at subscribe time.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { priceDropSubscriptions, products, type PriceDropSubscription } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function subscribe(orgId: string, input: {
  contactId: string; sku: string; channel?: string;
}): Promise<PriceDropSubscription> {
  const [prod] = await db.select().from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, input.sku))).limit(1);
  if (!prod) throw AppError.notFound('Product');
  const [row] = await db.insert(priceDropSubscriptions).values({
    orgId, contactId: input.contactId, sku: input.sku,
    channel: input.channel ?? 'email',
    priceAtSubscribe: prod.price,
  }).returning();
  return row!;
}

export async function listForContact(contactId: string): Promise<PriceDropSubscription[]> {
  return db.select().from(priceDropSubscriptions)
    .where(eq(priceDropSubscriptions.contactId, contactId));
}

export interface PriceDropResult {
  sku: string;
  oldPrice: number;
  newPrice: number;
  notified: number;
}

/**
 * Called whenever a product price changes. Notifies pending subscribers whose
 * snapshot price is strictly higher than the new price.
 */
export async function notifyPriceChange(
  orgId: string, sku: string, newPrice: number,
): Promise<PriceDropResult> {
  const subs = await db.select().from(priceDropSubscriptions).where(
    and(
      eq(priceDropSubscriptions.orgId, orgId),
      eq(priceDropSubscriptions.sku, sku),
      isNull(priceDropSubscriptions.notifiedAt),
      lt(sql`${newPrice}::numeric`, priceDropSubscriptions.priceAtSubscribe),
    ),
  );
  if (subs.length === 0) {
    return { sku, oldPrice: newPrice, newPrice, notified: 0 };
  }
  const oldPrice = Math.max(...subs.map((s) => Number(s.priceAtSubscribe)));
  await db.update(priceDropSubscriptions)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        eq(priceDropSubscriptions.orgId, orgId),
        eq(priceDropSubscriptions.sku, sku),
        isNull(priceDropSubscriptions.notifiedAt),
        lt(sql`${newPrice}::numeric`, priceDropSubscriptions.priceAtSubscribe),
      ),
    );
  return { sku, oldPrice, newPrice, notified: subs.length };
}

export async function unsubscribe(id: string, orgId: string): Promise<void> {
  await db.delete(priceDropSubscriptions)
    .where(and(eq(priceDropSubscriptions.id, id), eq(priceDropSubscriptions.orgId, orgId)));
}
