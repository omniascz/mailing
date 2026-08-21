/**
 * Loyalty enrollment service (#235)
 *
 * Handles member enrollment, status management, tier recalculation,
 * and the workflow action `enroll_in_loyalty`.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  loyaltyPrograms,
  loyaltyMembers,
  loyaltyPoints,
  type LoyaltyMember,
  type LoyaltyTier,
} from '../../db/schema/index.js';

// ─── Enrollment ───────────────────────────────────────────────────────────────

export interface EnrollResult {
  member: LoyaltyMember;
  alreadyEnrolled: boolean;
}

/**
 * Enroll a contact in a loyalty program.
 * Idempotent — returns existing member if already enrolled.
 */
export async function enrollMember(
  orgId: string,
  programId: string,
  contactId: string,
): Promise<EnrollResult> {
  // Check existing enrollment
  const [existing] = await db
    .select()
    .from(loyaltyMembers)
    .where(
      and(
        eq(loyaltyMembers.orgId, orgId),
        eq(loyaltyMembers.programId, programId),
        eq(loyaltyMembers.contactId, contactId),
      ),
    )
    .limit(1);

  if (existing) {
    return { member: existing, alreadyEnrolled: true };
  }

  const [program] = await db
    .select()
    .from(loyaltyPrograms)
    .where(and(eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.orgId, orgId)))
    .limit(1);

  if (!program || !program.active) {
    throw new Error('Loyalty program not found or inactive');
  }

  // Determine starting tier (lowest min-points tier)
  const tiers = (program.tiers as LoyaltyTier[]).sort((a, b) => a.minPoints - b.minPoints);
  const startingTierId = tiers[0]?.id ?? null;

  const [member] = await db
    .insert(loyaltyMembers)
    .values({
      orgId,
      programId,
      contactId,
      status: 'active',
      currentTierId: startingTierId,
      pointBalance: 0,
      lifetimePoints: 0,
    })
    .returning();

  return { member: member!, alreadyEnrolled: false };
}

// ─── Status management ────────────────────────────────────────────────────────

export async function updateMemberStatus(
  orgId: string,
  memberId: string,
  status: 'active' | 'suspended' | 'opted_out',
): Promise<LoyaltyMember> {
  const [updated] = await db
    .update(loyaltyMembers)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(loyaltyMembers.id, memberId), eq(loyaltyMembers.orgId, orgId)))
    .returning();

  if (!updated) throw new Error('Member not found');
  return updated;
}

// ─── Tier recalculation ───────────────────────────────────────────────────────

/**
 * Recalculate the member's tier based on their lifetime points.
 * Called after every earn transaction.
 * Returns the new tier ID (or null) and whether a tier-up occurred.
 */
export async function recalculateTier(
  orgId: string,
  memberId: string,
): Promise<{ tierId: string | null; tieredUp: boolean; tierName?: string }> {
  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.id, memberId), eq(loyaltyMembers.orgId, orgId)))
    .limit(1);

  if (!member) throw new Error('Member not found');

  const [program] = await db
    .select({ tiers: loyaltyPrograms.tiers })
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.id, member.programId))
    .limit(1);

  if (!program) return { tierId: null, tieredUp: false };

  const tiers = (program.tiers as LoyaltyTier[]).sort((a, b) => b.minPoints - a.minPoints);
  const newTier = tiers.find((t) => member.lifetimePoints >= t.minPoints) ?? null;
  const newTierId = newTier?.id ?? null;
  const tieredUp = newTierId !== member.currentTierId && !!newTier;

  if (newTierId !== member.currentTierId) {
    await db
      .update(loyaltyMembers)
      .set({ currentTierId: newTierId, updatedAt: new Date() })
      .where(eq(loyaltyMembers.id, memberId));
  }

  return { tierId: newTierId, tieredUp, tierName: newTier?.name };
}

// ─── Credit / debit points ────────────────────────────────────────────────────

export async function creditPoints(
  orgId: string,
  memberId: string,
  points: number,
  opts: {
    description?: string;
    sourceRef?: string;
    actorType?: string;
    actorId?: string;
    type?: 'earn' | 'bonus' | 'adjust' | 'refund';
  } = {},
): Promise<{ newBalance: number; tieredUp: boolean; tierName?: string }> {
  if (points <= 0) throw new Error('points must be positive for credit');

  const result = await db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(loyaltyMembers)
      .where(and(eq(loyaltyMembers.id, memberId), eq(loyaltyMembers.orgId, orgId)))
      .limit(1);

    if (!member || member.status !== 'active') throw new Error('Member not active');

    const newBalance = member.pointBalance + points;
    const newLifetime = member.lifetimePoints + (opts.type !== 'refund' ? points : 0);

    await tx
      .update(loyaltyMembers)
      .set({
        pointBalance: newBalance,
        lifetimePoints: newLifetime,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(loyaltyMembers.id, memberId));

    await tx.insert(loyaltyPoints).values({
      orgId,
      memberId,
      type: opts.type ?? 'earn',
      points,
      balanceAfter: newBalance,
      description: opts.description,
      sourceRef: opts.sourceRef,
      actorType: opts.actorType ?? 'system',
      actorId: opts.actorId,
    });

    return { newBalance, contactId: member.contactId, programId: member.programId };
  });

  const { tierId, tieredUp, tierName } = await recalculateTier(orgId, memberId);

  // Fire the `loyalty_tier_up` trigger here rather than at any one call site.
  // creditPoints has three production callers — the earn-rule path
  // (earning-rules.ts), the workflow award-points action (workflows/actions.ts)
  // and the manual admin credit (routes/v1/loyalty/programs.ts). The call used
  // to live in the workflow action alone, so tiering up through the loyalty API
  // fired nothing. Sitting here it covers all three.
  if (tieredUp && tierId && tierName && result.contactId) {
    void import('../workflows/triggers.js')
      .then(({ onLoyaltyTierUp }) =>
        onLoyaltyTierUp(orgId, result.contactId, result.programId, tierId, tierName),
      )
      .catch(() => {});
  }

  return { newBalance: result.newBalance, tieredUp, tierName };
}

export async function debitPoints(
  orgId: string,
  memberId: string,
  points: number,
  opts: {
    description?: string;
    sourceRef?: string;
    actorType?: string;
    actorId?: string;
  } = {},
): Promise<{ success: boolean; newBalance: number; reason?: string }> {
  if (points <= 0) throw new Error('points must be positive for debit');

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(loyaltyMembers)
      .where(and(eq(loyaltyMembers.id, memberId), eq(loyaltyMembers.orgId, orgId)))
      .limit(1);

    if (!member || member.status !== 'active') {
      return { success: false, newBalance: member?.pointBalance ?? 0, reason: 'Member not active' };
    }

    if (member.pointBalance < points) {
      return { success: false, newBalance: member.pointBalance, reason: 'Insufficient points' };
    }

    const newBalance = member.pointBalance - points;

    await tx
      .update(loyaltyMembers)
      .set({ pointBalance: newBalance, lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(loyaltyMembers.id, memberId));

    await tx.insert(loyaltyPoints).values({
      orgId,
      memberId,
      type: 'redeem',
      points: -points,
      balanceAfter: newBalance,
      description: opts.description,
      sourceRef: opts.sourceRef,
      actorType: opts.actorType ?? 'system',
      actorId: opts.actorId,
    });

    return { success: true, newBalance };
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMember(orgId: string, memberId: string): Promise<LoyaltyMember | null> {
  const [row] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.id, memberId), eq(loyaltyMembers.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function getMemberByContact(
  orgId: string,
  programId: string,
  contactId: string,
): Promise<LoyaltyMember | null> {
  const [row] = await db
    .select()
    .from(loyaltyMembers)
    .where(
      and(
        eq(loyaltyMembers.orgId, orgId),
        eq(loyaltyMembers.programId, programId),
        eq(loyaltyMembers.contactId, contactId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listMembers(
  orgId: string,
  programId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ data: LoyaltyMember[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 200);

  const conditions = [eq(loyaltyMembers.orgId, orgId), eq(loyaltyMembers.programId, programId)];

  if (opts.cursor) {
    conditions.push(sql`${loyaltyMembers.enrolledAt} < ${new Date(opts.cursor).toISOString()}`);
  }

  const rows = await db
    .select()
    .from(loyaltyMembers)
    .where(and(...conditions))
    .orderBy(sql`${loyaltyMembers.enrolledAt} DESC`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return {
    data,
    hasMore,
    cursor: hasMore && data.length > 0 ? data[data.length - 1]!.enrolledAt.toISOString() : null,
  };
}

// ─── Workflow action: enroll_in_loyalty ────────────────────────────────────────

/**
 * Invoked by the workflow actions executor when node type = 'enroll_in_loyalty'.
 * config: { programId: string }
 */
export async function workflowEnrollAction(
  orgId: string,
  contactId: string,
  programId: string,
): Promise<void> {
  await enrollMember(orgId, programId, contactId);
}
