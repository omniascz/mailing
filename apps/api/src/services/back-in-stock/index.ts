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

/** Mark all pending subscribers as notified. Returns count for queue dispatch. */
export async function notifyRestock(orgId: string, sku: string): Promise<RestockResult> {
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, sku)))
    .limit(1);
  if (!prod) throw AppError.notFound('Product');

  const subs = await listPendingForSku(orgId, sku);
  if (subs.length === 0) return { sku, notified: 0 };

  await db
    .update(backInStockSubscriptions)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        eq(backInStockSubscriptions.orgId, orgId),
        eq(backInStockSubscriptions.sku, sku),
        isNull(backInStockSubscriptions.notifiedAt),
      ),
    );

  return { sku, notified: subs.length };
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
