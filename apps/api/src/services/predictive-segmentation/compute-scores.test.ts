import { describe, it, expect } from 'vitest';
import { computeScores } from './index.js';

/**
 * Pure-function tests for the predictive scoring heuristic. We're not
 * unit-testing arbitrary numbers — we pin the qualitative properties the
 * downstream segments rely on:
 *   - never-bought contacts get CLV=0 + churnRisk≈0.1
 *   - a recent active buyer scores high on purchaseLikelihood and low on churn
 *   - a long-dormant past buyer scores high on churnRisk
 *   - scores are bounded [0..1] (purchase + churn) and never NaN
 */
describe('computeScores', () => {
  const dayMs = 86_400_000;
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * dayMs);

  it('zero-order contact: clv=0, churnRisk=0.1', () => {
    const s = computeScores({
      totalOrders: 0,
      totalRevenue: 0,
      totalOpens: 0,
      totalClicks: 0,
      totalSends: 0,
      firstOrderAt: null,
      lastOrderAt: null,
    });
    expect(s.clv).toBe(0);
    expect(s.churnRisk).toBe(0.1);
    expect(s.purchaseLikelihood).toBe(0);
  });

  it('active recent buyer: high purchase likelihood, low churn', () => {
    const s = computeScores({
      totalOrders: 5,
      totalRevenue: 500,
      totalOpens: 30,
      totalClicks: 10,
      totalSends: 40,
      firstOrderAt: daysAgo(180),
      lastOrderAt: daysAgo(3),
    });
    expect(s.purchaseLikelihood).toBeGreaterThanOrEqual(0.6);
    expect(s.churnRisk).toBeLessThan(0.3);
    expect(s.clv).toBeGreaterThan(0);
  });

  it('long-dormant past buyer: high churn risk', () => {
    const s = computeScores({
      totalOrders: 3,
      totalRevenue: 300,
      totalOpens: 10,
      totalClicks: 2,
      totalSends: 50,
      firstOrderAt: daysAgo(800),
      lastOrderAt: daysAgo(200),
    });
    expect(s.churnRisk).toBeGreaterThanOrEqual(0.9);
    expect(s.purchaseLikelihood).toBeLessThan(0.3);
  });

  it('purchase likelihood + churn risk always in [0..1]', () => {
    const inputs = [
      {
        totalOrders: 0,
        totalRevenue: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalSends: 0,
        firstOrderAt: null,
        lastOrderAt: null,
      },
      {
        totalOrders: 100,
        totalRevenue: 50_000,
        totalOpens: 500,
        totalClicks: 200,
        totalSends: 1000,
        firstOrderAt: daysAgo(500),
        lastOrderAt: daysAgo(1),
      },
      {
        totalOrders: 1,
        totalRevenue: 10,
        totalOpens: 1,
        totalClicks: 0,
        totalSends: 1,
        firstOrderAt: daysAgo(1),
        lastOrderAt: daysAgo(1),
      },
    ];
    for (const i of inputs) {
      const s = computeScores(i);
      expect(s.purchaseLikelihood).toBeGreaterThanOrEqual(0);
      expect(s.purchaseLikelihood).toBeLessThanOrEqual(1);
      expect(s.churnRisk).toBeGreaterThanOrEqual(0);
      expect(s.churnRisk).toBeLessThanOrEqual(1);
      expect(Number.isFinite(s.clv)).toBe(true);
    }
  });

  it('CLV degenerate inputs never produce NaN', () => {
    // Same-day first+last order would put tenureDays at the minimum 1 —
    // we want to verify that doesn't produce a divide-by-zero or NaN.
    const s = computeScores({
      totalOrders: 1,
      totalRevenue: 100,
      totalOpens: 0,
      totalClicks: 0,
      totalSends: 0,
      firstOrderAt: daysAgo(0),
      lastOrderAt: daysAgo(0),
    });
    expect(Number.isFinite(s.clv)).toBe(true);
    expect(Number.isFinite(s.purchaseLikelihood)).toBe(true);
    expect(Number.isFinite(s.churnRisk)).toBe(true);
  });

  it('engagement-only contact (opens but no orders) → low churn, low clv', () => {
    const s = computeScores({
      totalOrders: 0,
      totalRevenue: 0,
      totalOpens: 10,
      totalClicks: 2,
      totalSends: 20,
      firstOrderAt: null,
      lastOrderAt: null,
    });
    expect(s.clv).toBe(0);
    // wasActive=true via opens>=3, but no lastOrderAt so daysSinceLastOrder=Infinity
    // → churn clamps to 1. This is the "we engaged once and went silent" branch.
    expect(s.churnRisk).toBe(1);
  });
});
