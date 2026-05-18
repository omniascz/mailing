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

async function upsertAll(
  orgId: string,
  items: NormalizedProduct[],
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const p of items) {
    if (!p.sku) continue;
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.sku, p.sku)))
      .limit(1);

    if (existing) {
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
