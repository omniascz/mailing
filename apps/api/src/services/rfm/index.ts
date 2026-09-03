/**
 * RFM scoring — Recency, Frequency, Monetary segmentation.
 *
 * Each contact gets R, F, M scores 1–5 (5 = best). Combined RFM score = R*100 + F*10 + M
 * is mapped to one of 11 named segments (Klaviyo-style: champions, loyal, at-risk…).
 */

import { and, eq, sql, gt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactEngagement } from '../../db/schema/index.js';
import { quintileCuts, scoreQuintile } from './pure.js';

export type RfmSegment =
  | 'champions'
  | 'loyal'
  | 'potential_loyalists'
  | 'recent_customers'
  | 'promising'
  | 'needs_attention'
  | 'about_to_sleep'
  | 'at_risk'
  | 'cant_lose'
  | 'hibernating'
  | 'lost';

export interface RfmScore {
  recency: number; // 1–5, 5 = most recent
  frequency: number; // 1–5, 5 = most orders
  monetary: number; // 1–5, 5 = highest spend
  combined: number; // R*100 + F*10 + M
  segment: RfmSegment;
}

export function classifySegment(r: number, f: number, m: number): RfmSegment {
  // Mirror Klaviyo's lifecycle map.
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';
  if (r >= 3 && f >= 4) return 'loyal';
  if (r >= 4 && f <= 3 && m >= 3) return 'potential_loyalists';
  if (r === 5 && f === 1) return 'recent_customers';
  if (r >= 3 && f >= 1 && m <= 3) return 'promising';
  if (r === 3 && f === 3) return 'needs_attention';
  if (r === 2 && f >= 2) return 'about_to_sleep';
  if (r <= 2 && f >= 4) return 'cant_lose';
  if (r <= 2 && f >= 2 && m >= 3) return 'at_risk';
  if (r <= 2 && f <= 2) return 'hibernating';
  return 'lost';
}

/**
 * Recompute RFM scores for an entire org.
 * Recency is days-since-last-order (lower is better → invert).
 */
export async function refreshOrgRfm(orgId: string): Promise<{ scored: number }> {
  const rows = await db
    .select({
      contactId: contactEngagement.contactId,
      lastOrderAt: contactEngagement.lastOrderAt,
      firstOrderAt: contactEngagement.firstOrderAt,
      totalOrders: contactEngagement.totalOrders,
      totalRevenue: contactEngagement.totalRevenue,
    })
    .from(contactEngagement)
    .where(eq(contactEngagement.orgId, orgId));

  const buyers = rows.filter((r) => r.totalOrders > 0 && r.lastOrderAt);
  if (buyers.length === 0) return { scored: 0 };

  const now = Date.now();
  const recencies = buyers
    .map((r) => Math.floor((now - r.lastOrderAt!.getTime()) / 86_400_000))
    .sort((a, b) => a - b);
  const frequencies = buyers.map((r) => r.totalOrders).sort((a, b) => a - b);
  const monetaries = buyers.map((r) => Number(r.totalRevenue ?? 0)).sort((a, b) => a - b);

  const rCuts = quintileCuts(recencies);
  const fCuts = quintileCuts(frequencies);
  const mCuts = quintileCuts(monetaries);

  let scored = 0;
  for (const row of buyers) {
    const recencyDays = Math.floor((now - row.lastOrderAt!.getTime()) / 86_400_000);
    const r = scoreQuintile(recencyDays, rCuts, true); // fewer days = better
    const f = scoreQuintile(row.totalOrders, fCuts);
    const m = scoreQuintile(Number(row.totalRevenue ?? 0), mCuts);

    const intervalDays =
      row.firstOrderAt && row.totalOrders > 1
        ? Math.max(
            1,
            Math.floor(
              (row.lastOrderAt!.getTime() - row.firstOrderAt.getTime()) /
                86_400_000 /
                Math.max(1, row.totalOrders - 1),
            ),
          )
        : null;
    const nextOrderAt = intervalDays
      ? new Date(row.lastOrderAt!.getTime() + intervalDays * 86_400_000)
      : null;

    await db
      .update(contactEngagement)
      .set({
        rfmRecency: r,
        rfmFrequency: f,
        rfmMonetary: m,
        rfmScore: r * 100 + f * 10 + m,
        rfmSegment: classifySegment(r, f, m),
        avgOrderIntervalDays: intervalDays,
        predictedNextOrderAt: nextOrderAt,
      })
      .where(eq(contactEngagement.contactId, row.contactId));
    scored++;
  }
  return { scored };
}

export async function rfmDistribution(
  orgId: string,
): Promise<Array<{ segment: string; count: number }>> {
  const rs = await db.execute<{ segment: string; count: string }>(sql`
    SELECT rfm_segment AS segment, COUNT(*)::text AS count
    FROM contact_engagement
    WHERE org_id = ${orgId}::uuid AND rfm_segment IS NOT NULL
    GROUP BY rfm_segment
  `);
  return (rs as unknown as Array<{ segment: string; count: string }>).map((r) => ({
    segment: r.segment,
    count: Number(r.count),
  }));
}

/**
 * List contacts in a given RFM segment (paginated by contactId cursor).
 * Used by campaign builder to target "Champions", "At Risk", etc.
 */
export async function listSegmentContacts(opts: {
  orgId: string;
  segment: RfmSegment;
  cursor?: string;
  limit?: number;
}): Promise<{ contactIds: string[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  const conds = [
    eq(contactEngagement.orgId, opts.orgId),
    eq(contactEngagement.rfmSegment, opts.segment),
  ];
  if (opts.cursor) conds.push(gt(contactEngagement.contactId, opts.cursor));

  const rows = await db
    .select({ contactId: contactEngagement.contactId })
    .from(contactEngagement)
    .where(and(...conds))
    .orderBy(contactEngagement.contactId)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    contactIds: page.map((r) => r.contactId),
    nextCursor: hasMore ? page[page.length - 1]!.contactId : null,
  };
}

/**
 * Refresh RFM scores for every org that has any contact_engagement rows.
 * Called by the daily-run cron orchestrator; sequential per-org to keep
 * connection-pool pressure predictable (each refreshOrgRfm does a full
 * org scan + N updates).
 */
export async function refreshAllOrgsRfm(): Promise<{
  orgs: number;
  scored: number;
  errors: number;
}> {
  const orgs = (await db.execute<{ org_id: string }>(sql`
    SELECT DISTINCT org_id FROM contact_engagement WHERE total_orders > 0
  `)) as unknown as Array<{ org_id: string }>;

  let scored = 0;
  let errors = 0;
  for (const { org_id } of orgs) {
    try {
      const r = await refreshOrgRfm(org_id);
      scored += r.scored;
    } catch {
      errors++;
    }
  }
  return { orgs: orgs.length, scored, errors };
}

export async function getContactRfm(orgId: string, contactId: string): Promise<RfmScore | null> {
  const [row] = await db
    .select({
      r: contactEngagement.rfmRecency,
      f: contactEngagement.rfmFrequency,
      m: contactEngagement.rfmMonetary,
      score: contactEngagement.rfmScore,
      segment: contactEngagement.rfmSegment,
    })
    .from(contactEngagement)
    .where(and(eq(contactEngagement.contactId, contactId), eq(contactEngagement.orgId, orgId)))
    .limit(1);
  if (!row || row.r == null || row.f == null || row.m == null) return null;
  return {
    recency: row.r,
    frequency: row.f,
    monetary: row.m,
    combined: row.score!,
    segment: (row.segment ?? 'lost') as RfmSegment,
  };
}
