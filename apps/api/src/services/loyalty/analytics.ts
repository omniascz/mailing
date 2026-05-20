/**
 * Loyalty analytics service (#240)
 *
 * Aggregate stats for a loyalty program:
 *   - member count by tier and status
 *   - points earned / redeemed / expired in a period
 *   - top earners
 *   - reward redemption stats
 */

import { and, count, eq, gte, sql, sum } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  loyaltyMembers,
  loyaltyPoints,
  loyaltyRedemptions,
  loyaltyRewards,
} from '../../db/schema/index.js';

// ─── Program overview ─────────────────────────────────────────────────────────

export interface LoyaltyProgramStats {
  totalMembers: number;
  activeMembers: number;
  suspendedMembers: number;
  optedOutMembers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  activePointsBalance: number;
  totalRedemptions: number;
}

export async function getProgramStats(
  orgId: string,
  programId: string,
  days = 30,
): Promise<LoyaltyProgramStats> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [memberStats] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where status = 'active')::int`,
      suspended: sql<number>`count(*) filter (where status = 'suspended')::int`,
      opted_out: sql<number>`count(*) filter (where status = 'opted_out')::int`,
      totalBalance: sum(loyaltyMembers.pointBalance),
    })
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.orgId, orgId), eq(loyaltyMembers.programId, programId)));

  const [ptStats] = await db
    .select({
      issued: sql<number>`coalesce(sum(points) filter (where type in ('earn','bonus')), 0)::int`,
      redeemed: sql<number>`coalesce(abs(sum(points)) filter (where type = 'redeem'), 0)::int`,
      expired: sql<number>`coalesce(abs(sum(points)) filter (where type = 'expire'), 0)::int`,
    })
    .from(loyaltyPoints)
    .where(and(eq(loyaltyPoints.orgId, orgId), gte(loyaltyPoints.createdAt, since)));

  const [redemStats] = await db
    .select({ total: count() })
    .from(loyaltyRedemptions)
    .where(and(eq(loyaltyRedemptions.orgId, orgId), gte(loyaltyRedemptions.createdAt, since)));

  return {
    totalMembers: memberStats?.total ?? 0,
    activeMembers: memberStats?.active ?? 0,
    suspendedMembers: memberStats?.suspended ?? 0,
    optedOutMembers: memberStats?.opted_out ?? 0,
    totalPointsIssued: ptStats?.issued ?? 0,
    totalPointsRedeemed: ptStats?.redeemed ?? 0,
    totalPointsExpired: ptStats?.expired ?? 0,
    activePointsBalance: Number(memberStats?.totalBalance ?? 0),
    totalRedemptions: redemStats?.total ?? 0,
  };
}

// ─── Tier distribution ────────────────────────────────────────────────────────

export interface TierDistribution {
  tierId: string | null;
  count: number;
}

export async function getTierDistribution(
  orgId: string,
  programId: string,
): Promise<TierDistribution[]> {
  const rows = await db
    .select({
      tierId: loyaltyMembers.currentTierId,
      memberCount: count(),
    })
    .from(loyaltyMembers)
    .where(
      and(
        eq(loyaltyMembers.orgId, orgId),
        eq(loyaltyMembers.programId, programId),
        eq(loyaltyMembers.status, 'active'),
      ),
    )
    .groupBy(loyaltyMembers.currentTierId);

  return rows.map((r) => ({ tierId: r.tierId, count: r.memberCount }));
}

// ─── Top earners ──────────────────────────────────────────────────────────────

export interface TopEarner {
  memberId: string;
  contactId: string;
  lifetimePoints: number;
  pointBalance: number;
  currentTierId: string | null;
}

export async function getTopEarners(
  orgId: string,
  programId: string,
  limit = 10,
): Promise<TopEarner[]> {
  const rows = await db
    .select({
      memberId: loyaltyMembers.id,
      contactId: loyaltyMembers.contactId,
      lifetimePoints: loyaltyMembers.lifetimePoints,
      pointBalance: loyaltyMembers.pointBalance,
      currentTierId: loyaltyMembers.currentTierId,
    })
    .from(loyaltyMembers)
    .where(
      and(
        eq(loyaltyMembers.orgId, orgId),
        eq(loyaltyMembers.programId, programId),
        eq(loyaltyMembers.status, 'active'),
      ),
    )
    .orderBy(sql`${loyaltyMembers.lifetimePoints} DESC`)
    .limit(limit);

  return rows;
}

// ─── Reward performance ───────────────────────────────────────────────────────

export interface RewardStats {
  rewardId: string;
  name: string;
  type: string;
  pointCost: number;
  redemptionCount: number;
}

export async function getRewardStats(orgId: string, programId: string): Promise<RewardStats[]> {
  const rows = await db
    .select({
      rewardId: loyaltyRewards.id,
      name: loyaltyRewards.name,
      type: loyaltyRewards.type,
      pointCost: loyaltyRewards.pointCost,
      redemptionCount: loyaltyRewards.redemptionCount,
    })
    .from(loyaltyRewards)
    .where(
      and(
        eq(loyaltyRewards.orgId, orgId),
        eq(loyaltyRewards.programId, programId),
        sql`deleted_at IS NULL`,
      ),
    )
    .orderBy(sql`${loyaltyRewards.redemptionCount} DESC`);

  return rows;
}
