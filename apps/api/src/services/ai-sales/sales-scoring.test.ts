import { describe, it, expect } from 'vitest';
import { scoreFromFeatures, type WinProbabilityFeatures } from './win-probability.js';
import { scoreDealRisk } from './deal-risk.js';

const baseFeatures: WinProbabilityFeatures = {
  stageProbability: 50,
  dealAgeDays: 10,
  daysInCurrentStage: 5,
  daysPastExpectedClose: -5,
  stageMoveCount: 1,
  contactEngagementScore: 20,
  recentEmailOpens30d: 0,
  recentEmailClicks30d: 0,
};

describe('win-probability scoreFromFeatures', () => {
  it('starts from the stage probability baseline', () => {
    const r = scoreFromFeatures(baseFeatures);
    expect(r.probability).toBeCloseTo(0.5, 2);
  });

  it('recent 30d activity adds a positive factor', () => {
    const r = scoreFromFeatures({ ...baseFeatures, recentEmailOpens30d: 3, recentEmailClicks30d: 1 });
    expect(r.factors.some((f) => f.factor === 'recent_activity' && f.impact > 0)).toBe(true);
    expect(r.probability).toBeGreaterThan(0.5);
  });

  it('stagnation + overdue push probability down', () => {
    const r = scoreFromFeatures({ ...baseFeatures, daysInCurrentStage: 120, daysPastExpectedClose: 40 });
    expect(r.probability).toBeLessThan(0.5);
    expect(r.factors.map((f) => f.factor)).toEqual(expect.arrayContaining(['stagnation', 'overdue']));
  });

  it('clamps to [0.02, 0.98]', () => {
    expect(scoreFromFeatures({ ...baseFeatures, stageProbability: 100, stageMoveCount: 5, contactEngagementScore: 90, recentEmailOpens30d: 9 }).probability).toBeLessThanOrEqual(0.98);
    expect(scoreFromFeatures({ ...baseFeatures, stageProbability: 0, daysInCurrentStage: 999, daysPastExpectedClose: 999 }).probability).toBeGreaterThanOrEqual(0.02);
  });
});

describe('deal-risk scoreDealRisk', () => {
  it('a healthy deal is low risk with no flags', () => {
    const r = scoreDealRisk({ daysInCurrentStage: 3, daysPastExpectedClose: -10, daysSinceLastActivity: 2, value: 500, currency: 'USD' });
    expect(r.riskScore).toBe(0);
    expect(r.severity).toBe('low');
    expect(Object.values(r.flags).every((f) => f === false)).toBe(true);
  });

  it('stalled + overdue + silent stacks to high severity', () => {
    const r = scoreDealRisk({ daysInCurrentStage: 40, daysPastExpectedClose: 10, daysSinceLastActivity: 30, value: 500, currency: 'USD' });
    expect(r.flags).toMatchObject({ stalled: true, overdue: true, silent: true });
    expect(r.riskScore).toBe(85); // 30 + 35 + 20
    expect(r.severity).toBe('high');
  });

  it('high value only amplifies when another flag is set', () => {
    const healthy = scoreDealRisk({ daysInCurrentStage: 2, daysPastExpectedClose: -5, daysSinceLastActivity: 1, value: 50_000, currency: 'USD' });
    expect(healthy.riskScore).toBe(0); // highValue alone adds nothing
    const risky = scoreDealRisk({ daysInCurrentStage: 40, daysPastExpectedClose: -5, daysSinceLastActivity: 1, value: 50_000, currency: 'USD' });
    expect(risky.riskScore).toBe(45); // stalled 30 + highValue amp 15
  });

  it('respects custom thresholds', () => {
    const r = scoreDealRisk(
      { daysInCurrentStage: 15, daysPastExpectedClose: -1, daysSinceLastActivity: 10, value: 100, currency: 'USD' },
      { stalledDays: 10, silentDays: 7 },
    );
    expect(r.flags.stalled).toBe(true);
    expect(r.flags.silent).toBe(true);
  });
});
