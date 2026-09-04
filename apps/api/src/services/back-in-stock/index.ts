/**
 * Back-in-stock alerts — contacts subscribe to a SKU. When stock returns,
 * `notifyRestock(orgId, sku)` queues a notification for every pending subscriber.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  backInStockSubscriptions,
  products,
  type BackInStockSubscription,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function subscribe(
  orgId: string,
  input: {
    contactId: string;
    sku: string;
    channel?: string;
  },
): Promise<BackInStockSubscription> {
  const [row] = await db
    .insert(backInStockSubscriptions)
    .values({
      orgId,
      contactId: input.contactId,
      sku: input.sku,
      channel: input.channel ?? 'email',
    })
    .returning();
  return row!;
}

export async function listPendingForSku(
  orgId: string,
  sku: string,
): Promise<BackInStockSubscription[]> {
  return db
    .select()
    .from(backInStockSubscriptions)
    .where(
      and(
        eq(backInStockSubscriptions.orgId, orgId),
        eq(backInStockSubscriptions.sku, sku),
        isNull(backInStockSubscriptions.notifiedAt),
      ),
    );
}

export async function listForContact(contactId: string): Promise<BackInStockSubscription[]> {
  return db
    .select()
    .from(backInStockSubscriptions)
    .where(eq(backInStockSubscriptions.contactId, contactId));
}

export interface RestockResult {
  sku: string;
  notified: number;
}

/**
 * Has this contact already bought the thing they were waiting for?
 *
 * Read at dispatch time, never cached on the subscription: the purchase
 * happens between subscribing and restocking, which is exactly the window a
 * value written earlier would miss (#114). Scoped to orders placed after the
 * subscription — an order from last year is not a reason to stay silent now.
 */
async function alreadyBought(
  orgId: string,
  contactId: string,
  sku: string,
  since: Date,
): Promise<boolean> {
  const rows = await db.execute<{ one: number }>(sql`
    SELECT 1 AS one
    FROM "ecommerce_orders" o
    WHERE o."org_id" = ${orgId}::uuid
      AND o."contact_id" = ${contactId}::uuid
      AND COALESCE(o."ordered_at", o."synced_at") >= ${since.toISOString()}::timestamptz
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(o."items") AS it
        WHERE it->>'sku' = ${sku}
      )
    LIMIT 1
  `);
  const out = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  return out.length > 0;
}

/**
 * Notify everyone waiting for this SKU, and spend only the subscriptions whose
 * notification actually went out.
 *
 * What this replaces marked EVERY pending subscriber `notifiedAt` in one
 * blanket UPDATE and returned a count. No queue, no event, no message. Since
 * `notifiedAt` was set, the subscription was spent and could never fire again:
 * the feature did not merely fail to send, it quietly destroyed the list while
 * returning a number that read like success. That is why `stock-alert` sat on
 * BEYOND_CORE_BLOCKED.
 *
 * Per subscriber, and marked only on success. A blanket UPDATE cannot tell a
 * person who was notified from one who was suppressed or one whose dispatch
 * found nobody listening, and treating all three the same is what lost the
 * alert for good.
 *
 * Which way to fail: a duplicate "it's back" email is a mild annoyance; a lost
 * one means the customer never learns and the merchant loses the sale, for
 * something the customer explicitly asked to be told about. So the error is
 * taken on the side of sending twice — the subscription stays pending unless a
 * run really started.
 */
export async function notifyRestock(orgId: string, sku: string): Promise<RestockResult> {
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, sku)))
    .limit(1);
  if (!prod) throw AppError.notFound('Product');

  const subs = await listPendingForSku(orgId, sku);
  if (subs.length === 0) return { sku, notified: 0 };

  const { onBackInStock } = await import('../workflows/triggers.js');
  let notified = 0;

  for (const sub of subs) {
    if (await alreadyBought(orgId, sub.contactId, sku, sub.createdAt)) continue;

    const started = await onBackInStock(orgId, sub.contactId, {
      sku,
      productName: prod.name,
      price: Number(prod.price),
      currency: prod.currency,
      productUrl: prod.url ?? undefined,
      imageUrl: prod.imageUrl ?? undefined,
      stock: prod.stock ?? undefined,
    }).catch(() => 0);

    // Nothing started means nothing was sent. Leaving the row pending is the
    // whole point: the alert survives to fire on the next restock.
    if (started < 1) continue;

    await db
      .update(backInStockSubscriptions)
      .set({ notifiedAt: new Date() })
      .where(eq(backInStockSubscriptions.id, sub.id));
    notified++;
  }

  return { sku, notified };
}

export async function unsubscribe(id: string, orgId: string): Promise<void> {
  await db
    .delete(backInStockSubscriptions)
    .where(and(eq(backInStockSubscriptions.id, id), eq(backInStockSubscriptions.orgId, orgId)));
}

/** Pending count per SKU (admin overview). */
export async function pendingBySku(orgId: string): Promise<Array<{ sku: string; count: number }>> {
  const rs = await db.execute<{ sku: string; count: string }>(sql`
    SELECT sku, COUNT(*)::text AS count FROM back_in_stock_subscriptions
    WHERE org_id = ${orgId}::uuid AND notified_at IS NULL
    GROUP BY sku ORDER BY count DESC LIMIT 200
  `);
  return (rs as unknown as Array<{ sku: string; count: string }>).map((r) => ({
    sku: r.sku,
    count: Number(r.count),
  }));
}
