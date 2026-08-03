import { describe, it, expect } from 'vitest';
import { trainLeadModel, scoreLeadProbability, leadFeatures, type LeadSample } from './model.js';

describe('leadFeatures', () => {
  it('normalises leadScore + rates, clamped to [0,1]', () => {
    const f = leadFeatures({ leadScore: 400, totalOpens: 30, totalClicks: 5, totalSends: 10 });
    expect(f[0]).toBe(1); // 400/200 clamped
    expect(f[1]).toBe(1); // 30/10 clamped
    expect(f[2]).toBe(0.5); // 5/10
  });

  it('avoids divide-by-zero when there are no sends', () => {
    const f = leadFeatures({ leadScore: 0, totalOpens: 0, totalClicks: 0, totalSends: 0 });
    expect(f.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('trainLeadModel', () => {
  it('returns null when there is too little data (cold start → heuristic)', () => {
    const few: LeadSample[] = Array.from({ length: 10 }, () => ({
      leadScore: 100,
      totalOpens: 5,
      totalClicks: 1,
      totalSends: 10,
      converted: false,
    }));
    expect(trainLeadModel(few)).toBeNull();
  });

  it('returns null when one class is missing', () => {
    const allConverted: LeadSample[] = Array.from({ length: 80 }, () => ({
      leadScore: 150,
      totalOpens: 8,
      totalClicks: 3,
      totalSends: 10,
      converted: true,
    }));
    expect(trainLeadModel(allConverted)).toBeNull();
  });

  it('fits a model where engaged high-score leads convert more', () => {
    const samples: LeadSample[] = [];
    for (let i = 0; i < 200; i++) {
      const engaged = i % 2 === 0;
      samples.push(
        engaged
          ? { leadScore: 180, totalOpens: 9, totalClicks: 4, totalSends: 10, converted: true }
          : { leadScore: 20, totalOpens: 1, totalClicks: 0, totalSends: 10, converted: false },
      );
    }
    const model = trainLeadModel(samples);
    expect(model).not.toBeNull();
    const hot = scoreLeadProbability(model!, {
      leadScore: 180,
      totalOpens: 9,
      totalClicks: 4,
      totalSends: 10,
    });
    const cold = scoreLeadProbability(model!, {
      leadScore: 20,
      totalOpens: 1,
      totalClicks: 0,
      totalSends: 10,
    });
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeGreaterThan(0.6);
    expect(cold).toBeLessThan(0.4);
  });
});
