/**
 * Browse abandonment / retargeting service — #85
 *
 * Flow:
 *  1. Storefront JS calls POST /api/v1/browse/track to record page views.
 *  2. A scheduled job (or ad-hoc POST /api/v1/browse/check-abandonment) runs
 *     `checkAndFireAbandonments()`, which finds contacts who:
 *       - viewed products N+ hours ago without purchasing since then
 *       - have not already been sent an abandonment workflow recently
 *     and fires a `browse_abandoned` api_event per contact (with SKU payload)
 *     to start any active "Browse Abandonment" workflow.
 *  3. When a purchase is recorded (via ecommerce webhook or revenue.track),
 *     call `markConverted(orgId, contactId)` to suppress further triggers.
 *
 * Anonymous visitors (no contactId) are stored by visitorToken and matched
 * to a contact when identity-merge runs (via the identity-merge service).
 */

import { and, eq, gt, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  productPageViews,
  browseAbandonmentFires,
  type ProductPageView,
} from '../../db/schema/index.js';
import { onApiEvent } from '../workflows/triggers.js';

// ─── Page view tracking ───────────────────────────────────────────────────────

export interface TrackPageViewInput {
  orgId: string;
  contactId?: string | null;
  visitorToken?: string | null;
  sku?: string | null;
  productName?: string | null;
  productUrl?: string | null;
  meta?: {
    url?: string;
    referrer?: string;
    sessionId?: string;
    ua?: string;
  };
}

/**
 * Record (or upsert) a product page view.
 * Safe to call on every page load — duplicate views are collapsed into
 * last_viewed_at + view_count increments.
 */
export async function trackPageView(input: TrackPageViewInput): Promise<ProductPageView> {
  const { orgId, contactId, visitorToken, sku, productName, productUrl, meta = {} } = input;

  if (!contactId && !visitorToken) {
    throw Object.assign(new Error('Either contactId or visitorToken is required'), {
      statusCode: 400,
    });
  }

  // Upsert: contact+sku unique, increment view_count + refresh last_viewed_at
  const [row] = await db
    .insert(productPageViews)
    .values({
      orgId,
      contactId: contactId ?? null,
      visitorToken: visitorToken ?? null,
      sku: sku ?? null,
      productName: productName ?? null,
      productUrl: productUrl ?? null,
      meta,
    })
    .onConflictDoUpdate({
      target: [productPageViews.orgId, productPageViews.contactId, productPageViews.sku],
      set: {
        viewCount: sql`product_page_views.view_count + 1`,
        lastViewedAt: new Date(),
        productName: productName ?? undefined,
        productUrl: productUrl ?? undefined,
        meta,
      },
    })
    .returning();

  return row!;
}

/**
 * When a contact_id becomes known (identity merge), backfill their
 * anonymous page views.
 */
export async function associateVisitorViews(
  orgId: string,
  visitorToken: string,
  contactId: string,
): Promise<number> {
  const result = await db
    .update(productPageViews)
    .set({ contactId })
    .where(
      and(
        eq(productPageViews.orgId, orgId),
        eq(productPageViews.visitorToken, visitorToken),
        isNull(productPageViews.contactId),
      ),
    );
  return (result as unknown as { rowCount: number }).rowCount ?? 0;
}

// ─── Recent views query ───────────────────────────────────────────────────────

export async function listRecentViews(
  orgId: string,
  contactId: string,
  sinceHours = 72,
): Promise<ProductPageView[]> {
  const since = new Date(Date.now() - sinceHours * 3_600_000);
  return db
    .select()
    .from(productPageViews)
    .where(
      and(
        eq(productPageViews.orgId, orgId),
        eq(productPageViews.contactId, contactId),
        gt(productPageViews.lastViewedAt, since),
      ),
    );
}

// ─── Abandonment detection ────────────────────────────────────────────────────

export interface AbandonmentConfig {
  /** How many hours after last view to trigger abandonment (default: 1) */
  waitHours?: number;
  /** Don't re-fire within this many hours of a previous trigger (default: 72) */
  suppressionHours?: number;
  /** Minimum number of views before triggering (default: 1) */
  minViews?: number;
}

/**
 * Find contacts who:
 *   - last viewed a product between `waitHours` and `waitHours + 48h` ago
 *   - have not purchased since their last view (not tracked here; ecommerce
 *     integration calls markConverted when an order is ingested)
 *   - have not been fired an abandonment event within `suppressionHours`
 *
 * Fires `browse_abandoned` api_event on each matching contact and records
 * the fire in `browse_abandonment_fires`.
 *
 * Designed to be called from a BullMQ cron job every 15 minutes.
 *
 * @returns Count of workflow events fired
 */
export async function checkAndFireAbandonments(
  orgId: string,
  config: AbandonmentConfig = {},
): Promise<{ fired: number }> {
  const waitHours = config.waitHours ?? 1;
  const suppressionHours = config.suppressionHours ?? 72;
  const minViews = config.minViews ?? 1;

  const windowStart = new Date(Date.now() - (waitHours + 48) * 3_600_000);
  const windowEnd = new Date(Date.now() - waitHours * 3_600_000);
  const suppressionCutoff = new Date(Date.now() - suppressionHours * 3_600_000);

  // Find qualifying page views: within window, with a known contact, min views met
  const candidates = await db
    .select()
    .from(productPageViews)
    .where(
      and(
        eq(productPageViews.orgId, orgId),
        isNotNull(productPageViews.contactId),
        gt(productPageViews.lastViewedAt, windowStart),
        lt(productPageViews.lastViewedAt, windowEnd),
        gt(productPageViews.viewCount, minViews - 1),
      ),
    );

  if (candidates.length === 0) return { fired: 0 };

  // Check which contacts were already fired recently (not converted)
  const recentFires = await db
    .select({ contactId: browseAbandonmentFires.contactId, sku: browseAbandonmentFires.sku })
    .from(browseAbandonmentFires)
    .where(
      and(
        eq(browseAbandonmentFires.orgId, orgId),
        gt(browseAbandonmentFires.firedAt, suppressionCutoff),
        eq(browseAbandonmentFires.converted, false),
      ),
    );

  const suppressedKey = (contactId: string, sku: string | null) => `${contactId}:${sku ?? ''}`;
  const suppressed = new Set(recentFires.map((f) => suppressedKey(f.contactId, f.sku)));

  let fired = 0;
  for (const view of candidates) {
    if (!view.contactId) continue;
    const key = suppressedKey(view.contactId, view.sku);
    if (suppressed.has(key)) continue;

    // Fire workflow event
    await onApiEvent(orgId, view.contactId, 'browse_abandoned', {
      sku: view.sku,
      productName: view.productName,
      productUrl: view.productUrl,
      viewCount: view.viewCount,
      lastViewedAt: view.lastViewedAt?.toISOString(),
    });

    // Record the fire
    await db.insert(browseAbandonmentFires).values({
      orgId,
      contactId: view.contactId,
      sku: view.sku,
    });

    suppressed.add(key);
    fired += 1;
  }

  return { fired };
}

/**
 * Mark a contact as converted (purchased) so they won't be targeted again
 * until the suppression window expires.
 */
export async function markConverted(orgId: string, contactId: string): Promise<void> {
  await db
    .update(browseAbandonmentFires)
    .set({ converted: true })
    .where(
      and(
        eq(browseAbandonmentFires.orgId, orgId),
        eq(browseAbandonmentFires.contactId, contactId),
        eq(browseAbandonmentFires.converted, false),
      ),
    );
}

/**
 * List the most-viewed products for an org (useful for retargeting dashboards).
 */
export async function topViewedProducts(
  orgId: string,
  limit = 20,
): Promise<
  { sku: string | null; productName: string | null; totalViews: number; uniqueContacts: number }[]
> {
  const rows = await db.execute<{
    sku: string | null;
    product_name: string | null;
    total_views: string;
    unique_contacts: string;
  }>(sql`
    SELECT
      sku,
      product_name,
      SUM(view_count)::bigint   AS total_views,
      COUNT(DISTINCT contact_id) AS unique_contacts
    FROM product_page_views
    WHERE org_id = ${orgId}
    GROUP BY sku, product_name
    ORDER BY total_views DESC
    LIMIT ${limit}
  `);

  return (rows as typeof rows).map((r) => ({
    sku: r.sku,
    productName: r.product_name,
    totalViews: Number(r.total_views),
    uniqueContacts: Number(r.unique_contacts),
  }));
}
