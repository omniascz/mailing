/**
 * Price-drop alerts — notify subscribers when a watched SKU drops below
 * the price they snapshotted at subscribe time.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  priceDropSubscriptions,
  products,
  type PriceDropSubscription,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function subscribe(
  orgId: string,
  input: {
    contactId: string;
    sku: string;
    channel?: string;
  },
): Promise<PriceDropSubscription> {
  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, input.sku)))
    .limit(1);
  if (!prod) throw AppError.notFound('Product');
  const [row] = await db
    .insert(priceDropSubscriptions)
    .values({
      orgId,
      contactId: input.contactId,
      sku: input.sku,
      channel: input.channel ?? 'email',
      priceAtSubscribe: prod.price,
    })
    .returning();
  return row!;
}

export async function listForContact(contactId: string): Promise<PriceDropSubscription[]> {
  return db
    .select()
    .from(priceDropSubscriptions)
    .where(eq(priceDropSubscriptions.contactId, contactId));
}

export interface PriceDropResult {
  sku: string;
  oldPrice: number;
  newPrice: number;
  notified: number;
}

/**
 * Notify everyone watching this SKU whose snapshot price is above the new one,
 * and spend only the subscriptions whose notification actually went out.
 *
 * What this replaces marked every matching subscriber `notifiedAt` in one
 * blanket UPDATE and returned a count — no queue, no event, nothing sent. The
 * subscription was spent and could never fire again, so the price-drop list was
 * destroyed quietly while the return value read like success. The same defect
 * as `notifyRestock`, and the reason `stock-alert` was blocked.
 *
 * Per subscriber, marked only on success, for the same reason as there: a
 * blanket UPDATE cannot tell someone who was notified from someone whose
 * dispatch found nobody listening, and a lost price alert is worse than a
 * repeated one.
 */
export async function notifyPriceChange(
  orgId: string,
  sku: string,
  newPrice: number,
): Promise<PriceDropResult> {
  const subs = await db
    .select()
    .from(priceDropSubscriptions)
    .where(
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

  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, sku)))
    .limit(1);

  const oldPrice = Math.max(...subs.map((s) => Number(s.priceAtSubscribe)));
  const { onPriceDropped } = await import('../workflows/triggers.js');
  let notified = 0;

  for (const sub of subs) {
    const watched = Number(sub.priceAtSubscribe);
    const started = await onPriceDropped(orgId, sub.contactId, {
      sku,
      productName: prod?.name,
      // The price THIS subscriber was watching, not the highest of the group —
      // the email says "it dropped from what you saw", and the group maximum
      // would be somebody else's number.
      oldPrice: watched,
      newPrice,
      currency: prod?.currency,
      productUrl: prod?.url ?? undefined,
      imageUrl: prod?.imageUrl ?? undefined,
    }).catch(() => 0);

    if (started < 1) continue;

    await db
      .update(priceDropSubscriptions)
      .set({ notifiedAt: new Date() })
      .where(eq(priceDropSubscriptions.id, sub.id));
    notified++;
  }

  return { sku, oldPrice, newPrice, notified };
}

export async function unsubscribe(id: string, orgId: string): Promise<void> {
  await db
    .delete(priceDropSubscriptions)
    .where(and(eq(priceDropSubscriptions.id, id), eq(priceDropSubscriptions.orgId, orgId)));
}
