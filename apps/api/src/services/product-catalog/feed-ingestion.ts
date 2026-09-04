/**
 * Product-feed ingestion (#379/#393).
 *
 * Fetches a configured feed, dispatches parsing to the format-specific
 * adapter, then upserts products into the catalogue keyed by
 * (org_id, sku). Runs manually via the API or on a schedule via the
 * `product-feed-poller` BullMQ worker.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { products, productFeeds, type ProductFeed } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { parseProductFeed, type FeedFormat, type NormalizedProduct } from './feed-adapters.js';

export interface IngestResult {
  feedId: string;
  parsed: number;
  inserted: number;
  updated: number;
}

/**
 * Run one ingestion pass for a single feed row. Records `lastSyncedAt`
 * and `lastItemCount` on success, or `lastError` on failure.
 */
export async function ingestFeed(feedId: string): Promise<IngestResult> {
  const [feed] = await db.select().from(productFeeds).where(eq(productFeeds.id, feedId)).limit(1);
  if (!feed) throw AppError.notFound('Product feed');

  try {
    const xml = await downloadFeed(feed);
    const parsed = parseProductFeed(feed.format as FeedFormat, xml);
    const { inserted, updated } = await upsertAll(feed.orgId, parsed);

    await db
      .update(productFeeds)
      .set({
        lastSyncedAt: new Date(),
        lastItemCount: parsed.length,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(productFeeds.id, feed.id));

    return { feedId: feed.id, parsed: parsed.length, inserted, updated };
  } catch (err) {
    await db
      .update(productFeeds)
      .set({
        lastError: err instanceof Error ? err.message.slice(0, 2000) : String(err),
        updatedAt: new Date(),
      })
      .where(eq(productFeeds.id, feed.id));
    throw err;
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function downloadFeed(feed: ProductFeed): Promise<string> {
  const headers: Record<string, string> = { Accept: 'application/xml, text/xml' };
  if (feed.username) {
    const token = Buffer.from(`${feed.username}:${feed.password ?? ''}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  const res = await fetch(feed.url, { headers });
  if (!res.ok) throw new Error(`Feed fetch ${res.status}`);
  return res.text();
}

/**
 * Write the catalogue, and notice what CHANGED while doing it.
 *
 * The transition is detected here rather than in a transport, because every
 * source of truth ends at this table. The feed overwrote `price` and `stock`
 * and read back only `{ id }`, so the previous values were not merely ignored —
 * they were never fetched, and no comparison was possible anywhere in the
 * product. Nothing knew a SKU had come back into stock or fallen in price.
 *
 * A webhook would not have helped on its own: Shopify's
 * `inventory_levels/update` carries `available`, `inventory_item_id` and
 * `location_id` — state, not a delta, and no SKU, which is the key these
 * subscriptions are held by. Whoever wants the transition has to keep the
 * previous value and compare. Doing that at the write means the feed gets it
 * today and any webhook that lands here gets it for free.
 *
 * Alerts are dispatched after the row is written, so the notification an
 * alert triggers reads the new price rather than the old one.
 */
export async function ingestProducts(
  orgId: string,
  items: NormalizedProduct[],
): Promise<{ inserted: number; updated: number }> {
  return upsertAll(orgId, items);
}

async function upsertAll(
  orgId: string,
  items: NormalizedProduct[],
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const p of items) {
    if (!p.sku) continue;
    const [existing] = await db
      .select({ id: products.id, price: products.price, stock: products.stock })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.sku, p.sku)))
      .limit(1);

    if (existing) {
      const oldStock = existing.stock;
      const oldPrice = Number(existing.price);
      const newStock = p.stock ?? null;
      const newPrice = Number(p.price);

      // Out of stock, then in stock. `null` counts as unknown-and-unavailable:
      // a feed that starts reporting a quantity where it reported none is the
      // same event to the person waiting.
      const cameBackInStock =
        (oldStock === null || oldStock <= 0) && newStock !== null && newStock > 0;
      // Strictly lower. Equal is not a drop, and re-running the same feed must
      // not read as one.
      const priceFell =
        Number.isFinite(newPrice) && Number.isFinite(oldPrice) && newPrice < oldPrice;

      await db
        .update(products)
        .set({
          name: p.name || 'Untitled',
          description: p.description ?? undefined,
          price: String(p.price),
          currency: p.currency,
          imageUrl: p.imageUrl ?? undefined,
          url: p.url ?? undefined,
          categories: p.categories,
          stock: p.stock ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(products.id, existing.id));
      updated++;

      // Never let an alert failure lose the catalogue write that already
      // succeeded — the next ingest would then see no transition and the
      // change would be silent forever.
      if (cameBackInStock) {
        const { notifyRestock } = await import('../back-in-stock/index.js');
        await notifyRestock(orgId, p.sku).catch(() => {});
      }
      if (priceFell) {
        const { notifyPriceChange } = await import('../price-drop/index.js');
        await notifyPriceChange(orgId, p.sku, newPrice).catch(() => {});
      }
    } else {
      await db.insert(products).values({
        orgId,
        sku: p.sku,
        name: p.name || 'Untitled',
        description: p.description ?? undefined,
        price: String(p.price),
        currency: p.currency,
        imageUrl: p.imageUrl ?? undefined,
        url: p.url ?? undefined,
        categories: p.categories,
        stock: p.stock ?? undefined,
      });
      inserted++;
    }
  }
  return { inserted, updated };
}

/** Rows due for polling (lastSyncedAt older than pollIntervalMinutes). */
export async function listDueFeeds(limit = 50): Promise<ProductFeed[]> {
  return db
    .select()
    .from(productFeeds)
    .where(
      sql`${productFeeds.lastSyncedAt} IS NULL
          OR ${productFeeds.lastSyncedAt} < now() - make_interval(mins => ${productFeeds.pollIntervalMinutes})`,
    )
    .limit(limit);
}
