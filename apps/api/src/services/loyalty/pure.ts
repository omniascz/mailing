/**
 * Loyalty pure helpers (#234/#396).
 *
 * Tier resolution + validation logic extracted from `programs.ts` so we can
 * exercise the math without importing the Drizzle schema barrel (pre-existing
 * `timestamptz()` bug in other schemas breaks barrel loading in tests).
 */

export interface LoyaltyTier {
  id: string;
  name: string;
  minPoints: number;
  color?: string;
  multiplier?: number;
  benefits?: string[];
}

export type ExpiryType = 'never' | 'rolling' | 'fixed';

/** Default 4-tier bronze/silver/gold/platinum configuration. */
export const DEFAULT_TIERS: readonly LoyaltyTier[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    minPoints: 0,
    color: '#CD7F32',
    multiplier: 1.0,
    benefits: ['Exclusive member discounts'],
  },
  {
    id: 'silver',
    name: 'Silver',
    minPoints: 500,
    color: '#C0C0C0',
    multiplier: 1.25,
    benefits: ['5% bonus on all purchases', 'Early access to sales'],
  },
  {
    id: 'gold',
    name: 'Gold',
    minPoints: 2000,
    color: '#FFD700',
    multiplier: 1.5,
    benefits: ['10% bonus on all purchases', 'Free shipping', 'Birthday reward'],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    minPoints: 10000,
    color: '#E5E4E2',
    multiplier: 2.0,
    benefits: ['20% bonus on all purchases', 'Free shipping', 'VIP support', 'Quarterly gift'],
  },
];

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Enforce tier invariants:
 *   - Unique IDs
 *   - Lowest tier starts at 0 points
 *   - Non-empty names
 *   - Non-negative minPoints + multiplier
 *
 * Throws on the first violation so errors surface at config time rather than
 * during member enrollment.
 */
export function validateTiers(tiers: LoyaltyTier[]): void {
  if (tiers.length === 0) return;

  const sortedMinPoints = tiers.map((t) => t.minPoints).sort((a, b) => a - b);
  if (sortedMinPoints[0] !== 0) {
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

export function validateExpiryPolicy(expiryType: ExpiryType, expiryValue?: string | null): void {
  if (expiryType === 'rolling') {
    const days = Number(expiryValue);
    if (!expiryValue || Number.isNaN(days) || days < 1) {
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

// ─── Tier resolution ────────────────────────────────────────────────────────

/**
 * Find the highest tier whose `minPoints` ≤ `lifetimePoints`. Returns null
 * when no tiers are configured.
 */
export function resolveTier(tiers: LoyaltyTier[], lifetimePoints: number): LoyaltyTier | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return sorted.find((t) => lifetimePoints >= t.minPoints) ?? null;
}

/**
 * Next tier a member will reach + points still needed. `tier` is null when
 * the member is already at the top tier or no tiers exist.
 */
export function getNextTier(
  tiers: LoyaltyTier[],
  lifetimePoints: number,
): { tier: LoyaltyTier | null; pointsNeeded: number } {
  if (tiers.length === 0) return { tier: null, pointsNeeded: 0 };
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  const nextTier = sorted.find((t) => t.minPoints > lifetimePoints) ?? null;
  return {
    tier: nextTier,
    pointsNeeded: nextTier ? nextTier.minPoints - lifetimePoints : 0,
  };
}

/** Earning multiplier for a tier ID. Falls back to 1.0 when unknown. */
export function getTierMultiplier(tiers: LoyaltyTier[], tierId: string | null): number {
  if (!tierId || tiers.length === 0) return 1.0;
  return tiers.find((t) => t.id === tierId)?.multiplier ?? 1.0;
}

// ─── Expiry scheduling ──────────────────────────────────────────────────────

/**
 * Compute the `expiresAt` timestamp for a batch of newly-earned points.
 *   - `never` → null
 *   - `rolling` → now + N days
 *   - `fixed`  → next MM-DD occurrence after `now`
 */
export function computeExpiresAt(
  expiryType: ExpiryType,
  expiryValue: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (expiryType === 'never') return null;

  if (expiryType === 'rolling') {
    const days = Number(expiryValue);
    if (!expiryValue || Number.isNaN(days) || days < 1) return null;
    return new Date(now.getTime() + days * 86_400_000);
  }

  if (expiryType === 'fixed') {
    if (!expiryValue || !/^\d{2}-\d{2}$/.test(expiryValue)) return null;
    const [mm, dd] = expiryValue.split('-').map(Number);
    if (!mm || !dd) return null;
    const year = now.getUTCFullYear();
    let target = new Date(Date.UTC(year, mm - 1, dd));
    if (target.getTime() <= now.getTime()) {
      target = new Date(Date.UTC(year + 1, mm - 1, dd));
    }
    return target;
  }

  return null;
}

/**
 * Award points to a member's lifetime balance, respecting the earning
 * multiplier of their current tier. Returns rounded integer points.
 */
export function applyTierMultiplier(
  basePoints: number,
  tiers: LoyaltyTier[],
  tierId: string | null,
): number {
  const multiplier = getTierMultiplier(tiers, tierId);
  return Math.round(basePoints * multiplier);
}
