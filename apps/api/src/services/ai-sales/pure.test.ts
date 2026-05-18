import { describe, it, expect } from 'vitest';
import {
  scoreDealRisk,
  sentimentLabel,
  weightedSentiment,
  type DealRiskSignals,
} from './pure.js';

const baseline: DealRiskSignals = {
  daysInCurrentStage: 5,
  daysSinceLastActivity: 3,
  daysPastExpectedClose: 0,
  value: 1000,
  currency: 'CZK',
};

describe('scoreDealRisk', () => {
  it('returns low score + no flags for a fresh deal', () => {
    const res = scoreDealRisk(baseline);
    expect(res.riskScore).toBe(0);
    expect(res.severity).toBe('low');
    expect(res.flags).toEqual({
      stalled: false,
      overdue: false,
      silent: false,
      highValue: false,
    });
  });

  it('flags stalled deals and raises score to medium', () => {
    const res = scoreDealRisk({ ...baseline, daysInCurrentStage: 45 });
    expect(res.flags.stalled).toBe(true);
    expect(res.riskScore).toBe(30);
    expect(res.severity).toBe('medium');
  });

  it('flags overdue deals', () => {
    const res = scoreDealRisk({ ...baseline, daysPastExpectedClose: 5 });
    expect(res.flags.overdue).toBe(true);
    expect(res.riskScore).toBe(35);
  });

  it('stacks multiple flags and jumps to high severity', () => {
    const res = scoreDealRisk({
      ...baseline,
      daysInCurrentStage: 45,
      daysSinceLastActivity: 30,
      daysPastExpectedClose: 10,
      value: 50_000,
    });
    expect(res.flags).toEqual({ stalled: true, overdue: true, silent: true, highValue: true });
    expect(res.riskScore).toBe(100); // 30+35+20+15 = 100, clamped
    expect(res.severity).toBe('high');
  });

  it('high-value bonus only applies when another flag is set', () => {
    const res = scoreDealRisk({ ...baseline, value: 100_000 });
    expect(res.flags.highValue).toBe(true);
    expect(res.riskScore).toBe(0);
  });

  it('respects custom thresholds', () => {
    const res = scoreDealRisk(
      { ...baseline, daysInCurrentStage: 10 },
      { stalledDays: 5 },
    );
    expect(res.flags.stalled).toBe(true);
  });

  it('caps at 100 when all flags fire', () => {
    const res = scoreDealRisk({
      daysInCurrentStage: 120,
      daysSinceLastActivity: 90,
      daysPastExpectedClose: 60,
      value: 1_000_000,
      currency: 'USD',
    });
    expect(res.riskScore).toBeLessThanOrEqual(100);
  });
});

describe('sentimentLabel', () => {
  it('bands polarity into 3 labels', () => {
    expect(sentimentLabel(0.5)).toBe('positive');
    expect(sentimentLabel(0.1)).toBe('neutral');
    expect(sentimentLabel(-0.3)).toBe('negative');
    expect(sentimentLabel(0)).toBe('neutral');
  });
});

describe('weightedSentiment', () => {
  it('returns neutral with 0 samples', () => {
    expect(weightedSentiment([])).toEqual({ score: 0, label: 'neutral', samples: 0 });
  });

  it('weights recent messages more heavily', () => {
    const result = weightedSentiment([
      { polarity: 1.0, ageInDays: 0 },     // recent positive
      { polarity: -1.0, ageInDays: 60 },   // old negative (2 half-lives = 0.25× weight)
    ]);
    expect(result.score).toBeGreaterThan(0); // recent positive wins
    expect(result.label).toBe('positive');
  });

  it('averages evenly when all messages are same age', () => {
    const result = weightedSentiment(
      [
        { polarity: 0.5, ageInDays: 10 },
        { polarity: -0.5, ageInDays: 10 },
      ],
    );
    expect(result.score).toBeCloseTo(0, 4);
    expect(result.label).toBe('neutral');
  });
});
