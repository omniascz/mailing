import { describe, it, expect } from 'vitest';
import { computePredictiveScores, estimatePopulationRate, engagementScore } from './pure.js';

const DAY = 86_400_000;
const NOW = 1_750_000_000_000; // fixed for determinism
const daysAgo = (n: number) => new Date(NOW - n * DAY);

const base = {
  totalOrders: 0,
  totalRevenue: 0,
  totalOpens: 0,
  totalClicks: 0,
  totalSends: 0,
  firstOrderAt: null as Date | null,
  lastOrderAt: null as Date | null,
};

describe('exponential survival P(alive)', () => {
  it('silent for exactly one cadence → churn ≈ 1 - e^-1 ≈ 0.632', () => {
    // 11 repeat purchases over 110d → cadence 10d; λ0 huge so no shrinkage.
    const s = computePredictiveScores(
      {
        ...base,
        totalOrders: 12,
        totalRevenue: 1200,
        firstOrderAt: daysAgo(110),
        lastOrderAt: daysAgo(10),
      },
      { populationRatePerDay: 1, nowMs: NOW },
    );
    // λ_post ≈ (1+11)/(1/1 + 110) = 12/111 = 0.108/d → cadence ≈ 9.25d, silent 10d
    expect(s.churnRisk).toBeGreaterThan(0.6);
    expect(s.churnRisk).toBeLessThan(0.72);
  });

  it('very recent buyer → P(alive) ≈ 1 → churn near 0', () => {
    const s = computePredictiveScores(
      {
        ...base,
        totalOrders: 10,
        totalRevenue: 1000,
        firstOrderAt: daysAgo(100),
        lastOrderAt: daysAgo(1),
      },
      { populationRatePerDay: 0.1, nowMs: NOW },
    );
    expect(s.churnRisk).toBeLessThan(0.15);
  });
});

describe('Gamma–Poisson Bayesian shrinkage', () => {
  it('a single recent purchase does NOT produce a wild CLV (shrinks to prior)', () => {
    // One $500 order yesterday, observed window 1 day. NAIVE velocity
    // (avgOrder × orders/tenureDay × horizon) = 500 × 1 × 365 = $182,500 — an
    // absurd extrapolation from one data point. The Gamma–Poisson posterior
    // shrinks the rate toward the population (~2 orders/yr) → a grounded CLV.
    const naiveVelocityClv = 500 * (1 / 1) * 365;
    const s = computePredictiveScores(
      {
        ...base,
        totalOrders: 1,
        totalRevenue: 500,
        firstOrderAt: daysAgo(1),
        lastOrderAt: daysAgo(1),
      },
      { populationRatePerDay: 1 / 180, nowMs: NOW },
    );
    expect(s.clv).toBeGreaterThan(0);
    expect(s.clv).toBeLessThan(naiveVelocityClv / 50); // grounded, not extrapolated
  });

  it('more history pulls the rate away from the prior toward the data', () => {
    const sparse = computePredictiveScores(
      {
        ...base,
        totalOrders: 2,
        totalRevenue: 200,
        firstOrderAt: daysAgo(60),
        lastOrderAt: daysAgo(5),
      },
      { populationRatePerDay: 1 / 30, nowMs: NOW },
    );
    const rich = computePredictiveScores(
      {
        ...base,
        totalOrders: 20,
        totalRevenue: 2000,
        firstOrderAt: daysAgo(60),
        lastOrderAt: daysAgo(5),
      },
      { populationRatePerDay: 1 / 30, nowMs: NOW },
    );
    // The frequent buyer should have a higher purchase likelihood + CLV.
    expect(rich.purchaseLikelihood).toBeGreaterThan(sparse.purchaseLikelihood);
    expect(rich.clv).toBeGreaterThan(sparse.clv);
  });
});

describe('derived consistency + bounds', () => {
  it('all scores stay within [0,1] / finite across extremes', () => {
    const inputs = [
      base,
      {
        ...base,
        totalOrders: 1000,
        totalRevenue: 1e6,
        firstOrderAt: daysAgo(2000),
        lastOrderAt: daysAgo(0),
      },
      {
        ...base,
        totalOrders: 1,
        totalRevenue: 10,
        firstOrderAt: daysAgo(0),
        lastOrderAt: daysAgo(0),
      },
    ];
    for (const i of inputs) {
      const s = computePredictiveScores(i, { nowMs: NOW });
      expect(s.purchaseLikelihood).toBeGreaterThanOrEqual(0);
      expect(s.purchaseLikelihood).toBeLessThanOrEqual(1);
      expect(s.churnRisk).toBeGreaterThanOrEqual(0);
      expect(s.churnRisk).toBeLessThanOrEqual(1);
      expect(Number.isFinite(s.clv)).toBe(true);
    }
  });
});

describe('estimatePopulationRate', () => {
  it('pools repeat purchases over buyer tenure', () => {
    const rate = estimatePopulationRate(
      [
        { totalOrders: 5, firstOrderAt: daysAgo(100) }, // 4 repeats / 100d
        { totalOrders: 3, firstOrderAt: daysAgo(100) }, // 2 repeats / 100d
        { totalOrders: 0, firstOrderAt: null }, // non-buyer ignored
      ],
      NOW,
    );
    // (4+2) repeats / (100+100) buyer-days = 0.03/day
    expect(rate).toBeCloseTo(0.03, 4);
  });

  it('falls back to a weak default with no buyers', () => {
    expect(estimatePopulationRate([{ totalOrders: 0, firstOrderAt: null }], NOW)).toBeCloseTo(
      1 / 180,
      6,
    );
  });
});

describe('engagementScore', () => {
  it('weights clicks above opens, normalised by sends', () => {
    expect(engagementScore({ totalOpens: 10, totalClicks: 2, totalSends: 20 })).toBeCloseTo(0.3, 5);
    expect(engagementScore({ totalOpens: 0, totalClicks: 0, totalSends: 0 })).toBe(0);
  });
});
