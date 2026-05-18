import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIERS,
  validateTiers,
  validateExpiryPolicy,
  resolveTier,
  getNextTier,
  getTierMultiplier,
  applyTierMultiplier,
  computeExpiresAt,
  type LoyaltyTier,
} from './pure.js';

const tiers: LoyaltyTier[] = [...DEFAULT_TIERS];

describe('validateTiers', () => {
  it('accepts the default 4-tier configuration', () => {
    expect(() => validateTiers(tiers)).not.toThrow();
  });

  it('accepts empty tier list', () => {
    expect(() => validateTiers([])).not.toThrow();
  });

  it('rejects tiers whose lowest is non-zero', () => {
    expect(() =>
      validateTiers([{ id: 'a', name: 'A', minPoints: 100 }]),
    ).toThrow(/minPoints = 0/);
  });

  it('rejects duplicate tier IDs', () => {
    expect(() =>
      validateTiers([
        { id: 'a', name: 'A', minPoints: 0 },
        { id: 'a', name: 'B', minPoints: 100 },
      ]),
    ).toThrow(/unique/);
  });

  it('rejects empty tier name', () => {
    expect(() =>
      validateTiers([{ id: 'a', name: ' ', minPoints: 0 }]),
    ).toThrow(/name is required/);
  });

  it('rejects negative multiplier', () => {
    expect(() =>
      validateTiers([
        { id: 'a', name: 'A', minPoints: 0, multiplier: -1 },
      ]),
    ).toThrow(/multiplier must be >= 0/);
  });
});

describe('validateExpiryPolicy', () => {
  it('accepts "never" with no value', () => {
    expect(() => validateExpiryPolicy('never')).not.toThrow();
  });

  it('rolling requires positive integer days', () => {
    expect(() => validateExpiryPolicy('rolling', '365')).not.toThrow();
    expect(() => validateExpiryPolicy('rolling', '0')).toThrow();
    expect(() => validateExpiryPolicy('rolling', 'abc')).toThrow();
  });

  it('fixed requires MM-DD format', () => {
    expect(() => validateExpiryPolicy('fixed', '01-01')).not.toThrow();
    expect(() => validateExpiryPolicy('fixed', '12-31')).not.toThrow();
    expect(() => validateExpiryPolicy('fixed', '2026-01-01')).toThrow();
    expect(() => validateExpiryPolicy('fixed', '13-01')).toThrow();
    expect(() => validateExpiryPolicy('fixed', '01-32')).toThrow();
  });
});

describe('resolveTier', () => {
  it('picks the highest matching tier', () => {
    expect(resolveTier(tiers, 0)?.id).toBe('bronze');
    expect(resolveTier(tiers, 499)?.id).toBe('bronze');
    expect(resolveTier(tiers, 500)?.id).toBe('silver');
    expect(resolveTier(tiers, 2500)?.id).toBe('gold');
    expect(resolveTier(tiers, 100000)?.id).toBe('platinum');
  });

  it('returns null for empty tier list', () => {
    expect(resolveTier([], 9999)).toBeNull();
  });
});

describe('getNextTier', () => {
  it('returns points needed to reach the next tier', () => {
    expect(getNextTier(tiers, 0)).toMatchObject({
      tier: expect.objectContaining({ id: 'silver' }),
      pointsNeeded: 500,
    });
    expect(getNextTier(tiers, 1000)).toMatchObject({
      tier: expect.objectContaining({ id: 'gold' }),
      pointsNeeded: 1000,
    });
  });

  it('returns null tier when the member is already at the top', () => {
    const result = getNextTier(tiers, 50000);
    expect(result.tier).toBeNull();
    expect(result.pointsNeeded).toBe(0);
  });
});

describe('getTierMultiplier / applyTierMultiplier', () => {
  it('returns 1.0 for unknown tier', () => {
    expect(getTierMultiplier(tiers, null)).toBe(1.0);
    expect(getTierMultiplier(tiers, 'unknown')).toBe(1.0);
  });

  it('returns the configured multiplier', () => {
    expect(getTierMultiplier(tiers, 'silver')).toBe(1.25);
    expect(getTierMultiplier(tiers, 'platinum')).toBe(2.0);
  });

  it('applies multiplier and rounds to integer points', () => {
    expect(applyTierMultiplier(100, tiers, 'silver')).toBe(125);
    expect(applyTierMultiplier(100, tiers, 'platinum')).toBe(200);
    expect(applyTierMultiplier(100, tiers, null)).toBe(100);
    // Rounding — 33.3 * 1.25 = 41.625 → 42
    expect(applyTierMultiplier(33.3, tiers, 'silver')).toBe(42);
  });
});

describe('computeExpiresAt', () => {
  const now = new Date(Date.UTC(2026, 3, 24));

  it('returns null for "never"', () => {
    expect(computeExpiresAt('never', null, now)).toBeNull();
  });

  it('rolling adds N days', () => {
    const out = computeExpiresAt('rolling', '30', now);
    expect(out!.toISOString().slice(0, 10)).toBe('2026-05-24');
  });

  it('fixed picks next MM-DD occurrence', () => {
    expect(computeExpiresAt('fixed', '12-31', now)!.toISOString().slice(0, 10)).toBe(
      '2026-12-31',
    );
    // If date already passed this year, move to next year
    expect(computeExpiresAt('fixed', '01-01', now)!.toISOString().slice(0, 10)).toBe(
      '2027-01-01',
    );
  });

  it('returns null for malformed rolling/fixed values', () => {
    expect(computeExpiresAt('rolling', 'abc', now)).toBeNull();
    expect(computeExpiresAt('fixed', 'not-a-date', now)).toBeNull();
  });
});
