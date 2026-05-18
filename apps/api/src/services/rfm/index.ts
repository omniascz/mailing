/**
 * RFM scoring — Recency, Frequency, Monetary segmentation.
 *
 * Each contact gets R, F, M scores 1–5 (5 = best). Combined RFM score = R*100 + F*10 + M
 * is mapped to one of 11 named segments (Klaviyo-style: champions, loyal, at-risk…).
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactEngagement } from '../../db/schema/index.js';

export type RfmSegment =
  | 'champions' | 'loyal' | 'potential_loyalists' | 'recent_customers'
  | 'promising' | 'needs_attention' | 'about_to_sleep'
  | 'at_risk' | 'cant_lose' | 'hibernating' | 'lost';

export interface RfmScore {
  recency: number;       // 1–5, 5 = most recent
  frequency: number;     // 1–5, 5 = most orders
  monetary: number;      // 1–5, 5 = highest spend
  combined: number;      // R*100 + F*10 + M
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

/** Buckets a value into 1–5 quintile based on the org-wide thresholds. */
function bucket(value: number, q1: number, q2: number, q3: number, q4: number, invert = false): number {
  let score: number;
  if (value <= q1) score = 1;
  else if (value <= q2) score = 2;
  else if (value <= q3) score = 3;
  else if (value <= q4) score = 4;
  else score = 5;
  return invert ? 6 - score : score;
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
  const recencies = buyers.map((r) => Math.floor((now - r.lastOrderAt!.getTime()) / 86_400_000)).sort((a, b) => a - b);
  const frequencies = buyers.map((r) => r.totalOrders).sort((a, b) => a - b);
  const monetaries = buyers.map((r) => Number(r.totalRevenue ?? 0)).sort((a, b) => a - b);

  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]!;
  const rQ = [q(recencies, 0.2), q(recencies, 0.4), q(recencies, 0.6), q(recencies, 0.8)] as const;
  const fQ = [q(frequencies, 0.2), q(frequencies, 0.4), q(frequencies, 0.6), q(frequencies, 0.8)] as const;
  const mQ = [q(monetaries, 0.2), q(monetaries, 0.4), q(monetaries, 0.6), q(monetaries, 0.8)] as const;

  let scored = 0;
  for (const row of buyers) {
    const recencyDays = Math.floor((now - row.lastOrderAt!.getTime()) / 86_400_000);
    const r = bucket(recencyDays, rQ[0], rQ[1], rQ[2], rQ[3], true);
    const f = bucket(row.totalOrders, fQ[0], fQ[1], fQ[2], fQ[3]);
    const m = bucket(Number(row.totalRevenue ?? 0), mQ[0], mQ[1], mQ[2], mQ[3]);

    const intervalDays = row.firstOrderAt && row.totalOrders > 1
      ? Math.max(1, Math.floor((row.lastOrderAt!.getTime() - row.firstOrderAt.getTime()) / 86_400_000 / Math.max(1, row.totalOrders - 1)))
      : null;
    const nextOrderAt = intervalDays
      ? new Date(row.lastOrderAt!.getTime() + intervalDays * 86_400_000)
      : null;

    await db.update(contactEngagement)
      .set({
        rfmRecency: r, rfmFrequency: f, rfmMonetary: m,
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

export async function rfmDistribution(orgId: string): Promise<Array<{ segment: string; count: number }>> {
  const rs = await db.execute<{ segment: string; count: string }>(sql`
    SELECT rfm_segment AS segment, COUNT(*)::text AS count
    FROM contact_engagement
    WHERE org_id = ${orgId}::uuid AND rfm_segment IS NOT NULL
    GROUP BY rfm_segment
  `);
  return (rs as unknown as Array<{ segment: string; count: string }>).map((r) => ({
    segment: r.segment, count: Number(r.count),
  }));
}

export async function getContactRfm(contactId: string): Promise<RfmScore | null> {
  const [row] = await db
    .select({
      r: contactEngagement.rfmRecency,
      f: contactEngagement.rfmFrequency,
      m: contactEngagement.rfmMonetary,
      score: contactEngagement.rfmScore,
      segment: contactEngagement.rfmSegment,
    })
    .from(contactEngagement)
    .where(eq(contactEngagement.contactId, contactId))
    .limit(1);
  if (!row || row.r == null || row.f == null || row.m == null) return null;
  return {
    recency: row.r, frequency: row.f, monetary: row.m,
    combined: row.score!, segment: (row.segment ?? 'lost') as RfmSegment,
  };
}
