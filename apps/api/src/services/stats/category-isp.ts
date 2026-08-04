/**
 * Category & ISP (mailbox-provider) stats — SendGrid parity.
 *
 * Categories are per-send tags (denormalised from campaign.category onto each
 * email_event). ISP is the receiving mailbox provider, populated on the
 * delivery path. Both are aggregated into open/click/bounce funnels.
 */

import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { campaigns } from '../../db/schema/campaigns.js';

/** Per-dimension event funnel counts. */
export interface DimensionStats {
  dimension: string;
  requests: number; // send
  delivered: number; // deliver
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  complaints: number;
}

interface EventCountRow {
  dimension: string | null;
  eventType: string;
  count: number;
}

/**
 * Pure: fold flat (dimension, eventType, count) rows into per-dimension funnel
 * rows. Rows with a null dimension are grouped under `nullLabel`.
 */
export function rollupEventCounts(
  rows: EventCountRow[],
  nullLabel = 'uncategorized',
): DimensionStats[] {
  const byDim = new Map<string, DimensionStats>();
  for (const r of rows) {
    const key = r.dimension ?? nullLabel;
    let s = byDim.get(key);
    if (!s) {
      s = {
        dimension: key,
        requests: 0,
        delivered: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
        unsubscribes: 0,
        complaints: 0,
      };
      byDim.set(key, s);
    }
    const n = r.count;
    switch (r.eventType) {
      case 'send':
        s.requests += n;
        break;
      case 'deliver':
        s.delivered += n;
        break;
      case 'open':
        s.opens += n;
        break;
      case 'click':
        s.clicks += n;
        break;
      case 'bounce':
        s.bounces += n;
        break;
      case 'unsubscribe':
        s.unsubscribes += n;
        break;
      case 'complaint':
        s.complaints += n;
        break;
    }
  }
  // Stable, deterministic ordering: most requests first, then name.
  return [...byDim.values()].sort(
    (a, b) => b.requests - a.requests || a.dimension.localeCompare(b.dimension),
  );
}

export interface StatsFilter {
  from?: Date;
  to?: Date;
}

function rangeConds(orgId: string, f: StatsFilter) {
  const conds = [eq(emailEvents.orgId, orgId)];
  if (f.from) conds.push(gte(emailEvents.createdAt, f.from));
  if (f.to) conds.push(lte(emailEvents.createdAt, f.to));
  return conds;
}

/** Aggregate the event funnel grouped by category. */
export async function categoryStats(orgId: string, f: StatsFilter = {}): Promise<DimensionStats[]> {
  const rows = await db
    .select({
      dimension: emailEvents.category,
      eventType: emailEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(and(...rangeConds(orgId, f)))
    .groupBy(emailEvents.category, emailEvents.eventType);
  return rollupEventCounts(rows, 'uncategorized');
}

/** Aggregate the event funnel grouped by receiving ISP. */
export async function ispStats(orgId: string, f: StatsFilter = {}): Promise<DimensionStats[]> {
  const rows = await db
    .select({
      dimension: emailEvents.isp,
      eventType: emailEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(and(...rangeConds(orgId, f)))
    .groupBy(emailEvents.isp, emailEvents.eventType);
  return rollupEventCounts(rows, 'unknown');
}

/** Distinct category tags seen for this org (from events + campaigns). */
export async function listCategories(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: campaigns.category })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), isNotNull(campaigns.category)))
    .orderBy(desc(campaigns.category));
  return rows.map((r) => r.category!).filter(Boolean);
}

// ── Campaign → category resolver (denormalisation cache) ─────────────────────
// Category is looked up at event-ingestion time. A short in-process cache keeps
// the ingestion path from hitting the DB for every event of a busy campaign.

const CATEGORY_CACHE = new Map<string, { category: string | null; at: number }>();
const CATEGORY_TTL_MS = 5 * 60_000;
const CATEGORY_CACHE_MAX = 5_000;

/**
 * Resolve a campaign's category, cached for CATEGORY_TTL_MS. Returns null when
 * the campaign has no category or does not exist. `nowMs` is injectable for
 * deterministic tests.
 */
export async function resolveCampaignCategory(
  orgId: string,
  campaignId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!campaignId) return null;
  const cached = CATEGORY_CACHE.get(campaignId);
  if (cached && nowMs - cached.at < CATEGORY_TTL_MS) return cached.category;

  const [row] = await db
    .select({ category: campaigns.category })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  const category = row?.category ?? null;

  if (CATEGORY_CACHE.size >= CATEGORY_CACHE_MAX) CATEGORY_CACHE.clear();
  CATEGORY_CACHE.set(campaignId, { category, at: nowMs });
  return category;
}
