/**
 * Loyalty rewards service (#237)
 *
 * CRUD for the rewards catalog + redemption flow.
 */

import { and, eq, isNull, lte, gte, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  loyaltyRewards,
  loyaltyRedemptions,
  loyaltyMembers,
  type LoyaltyReward,
  type LoyaltyRedemption,
} from '../../db/schema/index.js';
import { debitPoints } from './enrollment.js';

// ─── Catalog CRUD ─────────────────────────────────────────────────────────────

export async function createReward(
  orgId: string,
  programId: string,
  input: {
    name: string;
    description?: string;
    type: LoyaltyReward['type'];
    pointCost: number;
    config?: Record<string, unknown>;
    requiredTierIds?: string[];
    maxRedemptions?: number;
    maxPerMember?: number;
    startsAt?: Date;
    endsAt?: Date;
  },
): Promise<LoyaltyReward> {
  const [reward] = await db
    .insert(loyaltyRewards)
    .values({
      orgId,
      programId,
      name: input.name,
      description: input.description,
      type: input.type,
      pointCost: input.pointCost,
      config: input.config ?? {},
      requiredTierIds: input.requiredTierIds ?? [],
      maxRedemptions: input.maxRedemptions,
      maxPerMember: input.maxPerMember,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    })
    .returning();
  return reward!;
}

export async function updateReward(
  orgId: string,
  rewardId: string,
  patch: Partial<{
    name: string;
    description: string;
    pointCost: number;
    config: Record<string, unknown>;
    requiredTierIds: string[];
    maxRedemptions: number;
    maxPerMember: number;
    active: boolean;
    startsAt: Date;
    endsAt: Date;
  }>,
): Promise<LoyaltyReward> {
  const [updated] = await db
    .update(loyaltyRewards)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(loyaltyRewards.id, rewardId), eq(loyaltyRewards.orgId, orgId), isNull(loyaltyRewards.deletedAt)),
    )
    .returning();
  if (!updated) throw new Error('Reward not found');
  return updated;
}

export async function deleteReward(orgId: string, rewardId: string): Promise<void> {
  await db
    .update(loyaltyRewards)
    .set({ deletedAt: new Date() })
    .where(and(eq(loyaltyRewards.id, rewardId), eq(loyaltyRewards.orgId, orgId)));
}

export async function listRewards(
  orgId: string,
  programId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<LoyaltyReward[]> {
  const now = new Date();
  const conditions = [
    eq(loyaltyRewards.orgId, orgId),
    eq(loyaltyRewards.programId, programId),
    isNull(loyaltyRewards.deletedAt),
  ];
  if (opts.activeOnly) {
    conditions.push(eq(loyaltyRewards.active, true));
    conditions.push(or(isNull(loyaltyRewards.startsAt), lte(loyaltyRewards.startsAt, now))!);
    conditions.push(or(isNull(loyaltyRewards.endsAt), gte(loyaltyRewards.endsAt, now))!);
  }
  return db
    .select()
    .from(loyaltyRewards)
    .where(and(...conditions))
    .orderBy(loyaltyRewards.pointCost);
}

// ─── Redemption ───────────────────────────────────────────────────────────────

export interface RedeemResult {
  success: boolean;
  redemption?: LoyaltyRedemption;
  newBalance?: number;
  reason?: string;
}

export async function redeemReward(
  orgId: string,
  memberId: string,
  rewardId: string,
): Promise<RedeemResult> {
  const [reward] = await db
    .select()
    .from(loyaltyRewards)
    .where(
      and(eq(loyaltyRewards.id, rewardId), eq(loyaltyRewards.orgId, orgId), isNull(loyaltyRewards.deletedAt)),
    )
    .limit(1);

  if (!reward || !reward.active) {
    return { success: false, reason: 'Reward not found or inactive' };
  }

  const now = new Date();
  if (reward.startsAt && reward.startsAt > now) {
    return { success: false, reason: 'Reward not yet available' };
  }
  if (reward.endsAt && reward.endsAt < now) {
    return { success: false, reason: 'Reward has expired' };
  }
  if (reward.maxRedemptions !== null && reward.redemptionCount >= reward.maxRedemptions!) {
    return { success: false, reason: 'Reward fully redeemed' };
  }

  // Check per-member cap
  if (reward.maxPerMember) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loyaltyRedemptions)
      .where(
        and(eq(loyaltyRedemptions.rewardId, rewardId), eq(loyaltyRedemptions.memberId, memberId)),
      );
    if ((countRow?.count ?? 0) >= reward.maxPerMember) {
      return { success: false, reason: 'Per-member redemption limit reached' };
    }
  }

  // Check tier requirement
  if ((reward.requiredTierIds as string[]).length > 0) {
    const [member] = await db
      .select({ currentTierId: loyaltyMembers.currentTierId })
      .from(loyaltyMembers)
      .where(eq(loyaltyMembers.id, memberId))
      .limit(1);

    if (!member?.currentTierId || !(reward.requiredTierIds as string[]).includes(member.currentTierId)) {
      return { success: false, reason: 'Member tier does not meet requirement' };
    }
  }

  // Debit points
  const debitResult = await debitPoints(orgId, memberId, reward.pointCost, {
    description: `Redeemed reward: ${reward.name}`,
    sourceRef: rewardId,
  });

  if (!debitResult.success) {
    return { success: false, newBalance: debitResult.newBalance, reason: debitResult.reason };
  }

  // Record redemption + increment counter
  const [redemption] = await db
    .insert(loyaltyRedemptions)
    .values({
      orgId,
      rewardId,
      memberId,
      pointsSpent: reward.pointCost,
    })
    .returning();

  await db
    .update(loyaltyRewards)
    .set({ redemptionCount: reward.redemptionCount + 1, updatedAt: new Date() })
    .where(eq(loyaltyRewards.id, rewardId));

  return { success: true, redemption: redemption!, newBalance: debitResult.newBalance };
}

export async function listRedemptions(
  orgId: string,
  memberId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ data: LoyaltyRedemption[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const conditions = [
    eq(loyaltyRedemptions.orgId, orgId),
    eq(loyaltyRedemptions.memberId, memberId),
  ];
  if (opts.cursor) {
    conditions.push(sql`${loyaltyRedemptions.createdAt} < ${new Date(opts.cursor).toISOString()}`);
  }

  const rows = await db
    .select()
    .from(loyaltyRedemptions)
    .where(and(...conditions))
    .orderBy(sql`${loyaltyRedemptions.createdAt} DESC`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return {
    data,
    hasMore,
    cursor: hasMore && data.length > 0 ? data[data.length - 1]!.createdAt.toISOString() : null,
  };
}
