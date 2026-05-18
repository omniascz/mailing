/**
 * Loyalty programs service (#234)
 *
 * Business logic for program lifecycle: creation, tier management,
 * expiration-policy validation, and the default-program pattern.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  loyaltyPrograms,
  type LoyaltyProgram,
  type LoyaltyTier,
} from '../../db/schema/index.js';

// ─── Default tiers ────────────────────────────────────────────────────────────

export const DEFAULT_TIERS: LoyaltyTier[] = [
  { id: 'bronze', name: 'Bronze', minPoints: 0,    color: '#CD7F32', multiplier: 1.0, benefits: ['Exclusive member discounts'] },
  { id: 'silver', name: 'Silver', minPoints: 500,  color: '#C0C0C0', multiplier: 1.25, benefits: ['5% bonus on all purchases', 'Early access to sales'] },
  { id: 'gold',   name: 'Gold',   minPoints: 2000, color: '#FFD700', multiplier: 1.5, benefits: ['10% bonus on all purchases', 'Free shipping', 'Birthday reward'] },
  { id: 'platinum', name: 'Platinum', minPoints: 10000, color: '#E5E4E2', multiplier: 2.0, benefits: ['20% bonus on all purchases', 'Free shipping', 'VIP support', 'Quarterly gift'] },
];

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateTiers(tiers: LoyaltyTier[]): void {
  if (tiers.length === 0) return; // empty = no tier structure

  const sortedMinPoints = tiers.map((t) => t.minPoints).sort((a, b) => a - b);
  const firstMin = sortedMinPoints[0];
  if (firstMin !== 0) {
    throw new Error('The lowest tier must have minPoints = 0');
  }

  const ids = new Set(tiers.map((t) => t.id));
  if (ids.size !== tiers.length) throw new Error('Tier IDs must be unique');

  for (const tier of tiers) {
    if (!tier.name?.trim()) throw new Error(`Tier ${tier.id}: name is required`);
    if (tier.minPoints < 0) throw new Error(`Tier ${tier.id}: minPoints must be >= 0`);
    if (tier.multiplier !== undefined && tier.multiplier < 0) {
      throw new Error(`Tier ${tier.id}: multiplier must be >= 0`);
    }
  }
}

export function validateExpiryPolicy(
  expiryType: string,
  expiryValue?: string | null,
): void {
  if (expiryType === 'rolling') {
    const days = Number(expiryValue);
    if (!expiryValue || isNaN(days) || days < 1) {
      throw new Error('rolling expiry requires expiryValue = number of days (≥ 1)');
    }
  }
  if (expiryType === 'fixed') {
    if (!expiryValue || !/^\d{2}-\d{2}$/.test(expiryValue)) {
      throw new Error('fixed expiry requires expiryValue = "MM-DD" (e.g. "01-01")');
    }
    const [mm, dd] = expiryValue.split('-').map(Number);
    if (!mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      throw new Error('fixed expiry date is invalid');
    }
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createProgram(
  orgId: string,
  input: {
    name: string;
    description?: string;
    tiers?: LoyaltyTier[];
    useDefaultTiers?: boolean;
    expiryType?: 'never' | 'rolling' | 'fixed';
    expiryValue?: string;
    earningEnabled?: boolean;
    redemptionEnabled?: boolean;
  },
): Promise<LoyaltyProgram> {
  const tiers = input.tiers ?? (input.useDefaultTiers ? DEFAULT_TIERS : []);
  validateTiers(tiers);
  validateExpiryPolicy(input.expiryType ?? 'never', input.expiryValue);

  const [program] = await db
    .insert(loyaltyPrograms)
    .values({
      orgId,
      name: input.name,
      description: input.description,
      tiers,
      expiryType: input.expiryType ?? 'never',
      expiryValue: input.expiryValue,
      earningEnabled: input.earningEnabled ?? true,
      redemptionEnabled: input.redemptionEnabled ?? true,
    })
    .returning();
  return program!;
}

export async function updateProgram(
  orgId: string,
  programId: string,
  patch: Partial<{
    name: string;
    description: string;
    tiers: LoyaltyTier[];
    expiryType: 'never' | 'rolling' | 'fixed';
    expiryValue: string;
    earningEnabled: boolean;
    redemptionEnabled: boolean;
    active: boolean;
  }>,
): Promise<LoyaltyProgram> {
  if (patch.tiers) validateTiers(patch.tiers);
  if (patch.expiryType) validateExpiryPolicy(patch.expiryType, patch.expiryValue);

  const [updated] = await db
    .update(loyaltyPrograms)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(loyaltyPrograms.id, programId),
        eq(loyaltyPrograms.orgId, orgId),
        isNull(loyaltyPrograms.deletedAt),
      ),
    )
    .returning();

  if (!updated) throw new Error('Program not found');
  return updated;
}

export async function deleteProgram(orgId: string, programId: string): Promise<void> {
  await db
    .update(loyaltyPrograms)
    .set({ deletedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.orgId, orgId)));
}

export async function getProgram(orgId: string, programId: string): Promise<LoyaltyProgram | null> {
  const [row] = await db
    .select()
    .from(loyaltyPrograms)
    .where(
      and(
        eq(loyaltyPrograms.id, programId),
        eq(loyaltyPrograms.orgId, orgId),
        isNull(loyaltyPrograms.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listPrograms(orgId: string): Promise<LoyaltyProgram[]> {
  return db
    .select()
    .from(loyaltyPrograms)
    .where(and(eq(loyaltyPrograms.orgId, orgId), isNull(loyaltyPrograms.deletedAt)))
    .orderBy(loyaltyPrograms.createdAt);
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────

/**
 * Given a member's lifetime points, find the correct tier.
 * Returns null if no tiers are configured.
 */
export function resolveTier(tiers: LoyaltyTier[], lifetimePoints: number): LoyaltyTier | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return sorted.find((t) => lifetimePoints >= t.minPoints) ?? null;
}

/**
 * Get the tier that would be reached NEXT after the current one.
 * Used to show progress toward the next tier in the member dashboard.
 */
export function getNextTier(tiers: LoyaltyTier[], lifetimePoints: number): {
  tier: LoyaltyTier | null;
  pointsNeeded: number;
} {
  if (tiers.length === 0) return { tier: null, pointsNeeded: 0 };
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  const nextTier = sorted.find((t) => t.minPoints > lifetimePoints) ?? null;
  return {
    tier: nextTier,
    pointsNeeded: nextTier ? nextTier.minPoints - lifetimePoints : 0,
  };
}

/**
 * Returns the earning multiplier for a tier ID.
 * Falls back to 1.0 if tier not found.
 */
export function getTierMultiplier(tiers: LoyaltyTier[], tierId: string | null): number {
  if (!tierId || tiers.length === 0) return 1.0;
  return tiers.find((t) => t.id === tierId)?.multiplier ?? 1.0;
}

// ─── Expiry scheduling ────────────────────────────────────────────────────────

/**
 * For 'fixed' expiry: compute the next expiry date (next MM-DD occurrence
 * that is in the future). Used to stamp `expiresAt` on newly-earned points.
 */
export function computeFixedExpiryDate(expiryValue: string): Date {
  const [mm, dd] = expiryValue.split('-').map(Number);
  const now = new Date();
  const candidate = new Date(now.getFullYear(), mm! - 1, dd!);
  if (candidate <= now) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

/**
 * For 'rolling' expiry: compute expiry = now + N days.
 */
export function computeRollingExpiryDate(expiryDays: number): Date {
  return new Date(Date.now() + expiryDays * 86_400_000);
}
