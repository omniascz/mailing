/**
 * Autonomous A/B Test Optimizer — epsilon-greedy multi-armed bandit.
 * Continuously adjusts traffic allocation across campaign variants
 * based on live engagement metrics, without waiting for statistical significance.
 *
 * epsilon = 0.1 (10% exploration, 90% exploitation of current winner)
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { redis } from '@forgemsg/shared/redis';

const EPSILON = 0.1;

interface VariantStats {
  variantId: string;
  sends: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
  /** Thompson sampling beta distribution alpha (successes) */
  alpha: number;
  /** Thompson sampling beta distribution beta (failures) */
  beta: number;
}

export interface BanditAllocation {
  variantId: string;
  trafficPercent: number;
  isLeader: boolean;
}

/** Compute current variant stats from live email events */
export async function computeVariantStats(
  orgId: string,
  campaignId: string,
  variantIds: string[],
): Promise<VariantStats[]> {
  const rows = await db
    .select({
      variantId: emailEvents.abVariantId,
      sends: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'send')`,
      opens: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'open')`,
      clicks: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'click')`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.campaignId, campaignId)))
    .groupBy(emailEvents.abVariantId)
    .orderBy(desc(sql`count(*) filter (where ${emailEvents.eventType} = 'open')`));

  return variantIds.map((vId) => {
    const row = rows.find((r) => r.variantId === vId);
    const sends = Number(row?.sends ?? 0);
    const opens = Number(row?.opens ?? 0);
    const clicks = Number(row?.clicks ?? 0);
    const openRate = sends > 0 ? opens / sends : 0;
    const clickRate = sends > 0 ? clicks / sends : 0;
    return {
      variantId: vId,
      sends,
      opens,
      clicks,
      openRate,
      clickRate,
      alpha: opens + 1,
      beta: Math.max(1, sends - opens + 1),
    };
  });
}

/**
 * Compute optimal traffic allocation using epsilon-greedy bandit.
 * Returns new allocation percentages.
 */
export function computeBanditAllocation(stats: VariantStats[]): BanditAllocation[] {
  if (stats.length === 0) return [];
  if (stats.length === 1)
    return [{ variantId: stats[0]!.variantId, trafficPercent: 100, isLeader: true }];

  // Find current leader (highest click-weighted open rate)
  const scored = stats.map((s) => ({
    ...s,
    score: s.openRate * 0.5 + s.clickRate * 0.5,
  }));
  scored.sort((a, b) => b.score - a.score);
  const leaderId = scored[0]!.variantId;

  // epsilon-greedy: (1-epsilon)% to leader, epsilon% split equally among rest
  const explorationPerVariant = stats.length > 1 ? (EPSILON * 100) / (stats.length - 1) : 0;

  return stats.map((s) => {
    const isLeader = s.variantId === leaderId;
    const trafficPercent = isLeader
      ? (1 - EPSILON) * 100 + (stats.length === 1 ? 0 : 0)
      : explorationPerVariant;
    return { variantId: s.variantId, trafficPercent: Math.round(trafficPercent), isLeader };
  });
}

/** Cache allocation in Redis for the campaign (TTL 1h) */
export async function updateBanditAllocation(
  orgId: string,
  campaignId: string,
  variantIds: string[],
): Promise<BanditAllocation[]> {
  const stats = await computeVariantStats(orgId, campaignId, variantIds);
  const allocation = computeBanditAllocation(stats);
  await redis.setex(`bandit:${orgId}:${campaignId}`, 3600, JSON.stringify(allocation));
  return allocation;
}

/** Get cached allocation (or compute fresh if missing) */
export async function getBanditAllocation(
  orgId: string,
  campaignId: string,
  variantIds: string[],
): Promise<BanditAllocation[]> {
  const cached = await redis.get(`bandit:${orgId}:${campaignId}`);
  if (cached) return JSON.parse(cached) as BanditAllocation[];
  return updateBanditAllocation(orgId, campaignId, variantIds);
}
