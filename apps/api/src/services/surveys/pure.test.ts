import { describe, it, expect } from 'vitest';
import {
  npsClassify,
  computeNpsScore,
  computeCsatScore,
  npsTemplate,
  csatTemplate,
  cesTemplate,
} from './nps-csat.js';

describe('npsClassify', () => {
  it('classifies 9-10 as promoter', () => {
    expect(npsClassify(9)).toBe('promoter');
    expect(npsClassify(10)).toBe('promoter');
  });

  it('classifies 7-8 as passive', () => {
    expect(npsClassify(7)).toBe('passive');
    expect(npsClassify(8)).toBe('passive');
  });

  it('classifies 0-6 as detractor', () => {
    expect(npsClassify(0)).toBe('detractor');
    expect(npsClassify(6)).toBe('detractor');
  });
});

describe('computeNpsScore', () => {
  it('returns 0 for empty array', () => {
    expect(computeNpsScore([])).toBe(0);
  });

  it('returns 100 when all promoters', () => {
    expect(computeNpsScore([9, 10, 10, 9])).toBe(100);
  });

  it('returns -100 when all detractors', () => {
    expect(computeNpsScore([0, 1, 2, 3])).toBe(-100);
  });

  it('computes mixed NPS correctly', () => {
    // 4 promoters, 2 passives, 4 detractors → (40% - 40%) = 0
    const scores = [9, 10, 9, 10, 7, 8, 0, 1, 2, 3];
    expect(computeNpsScore(scores)).toBe(0);
  });

  it('rounds to integer', () => {
    // 2 promoters, 0 passives, 1 detractor → (67% - 33%) ≈ 33
    const score = computeNpsScore([10, 9, 2]);
    expect(Number.isInteger(score)).toBe(true);
  });
});

describe('computeCsatScore', () => {
  it('returns 0 for empty array', () => {
    expect(computeCsatScore([])).toBe(0);
  });

  it('returns 100 when all satisfied (4+5)', () => {
    expect(computeCsatScore([4, 5, 4, 5])).toBe(100);
  });

  it('returns 0 when all unsatisfied (1-3)', () => {
    expect(computeCsatScore([1, 2, 3, 1])).toBe(0);
  });

  it('computes 50% correctly', () => {
    expect(computeCsatScore([5, 5, 1, 1])).toBe(50);
  });
});

describe('survey templates', () => {
  it('nps template has nps question', () => {
    const t = npsTemplate();
    expect(t.questions[0]?.type).toBe('nps');
    expect(t.questions[0]?.min).toBe(0);
    expect(t.questions[0]?.max).toBe(10);
  });

  it('csat template has rating question', () => {
    const t = csatTemplate();
    expect(t.questions[0]?.type).toBe('rating');
    expect(t.questions[0]?.max).toBe(5);
  });

  it('ces template has 7-point scale', () => {
    const t = cesTemplate();
    expect(t.questions[0]?.type).toBe('scale');
    expect(t.questions[0]?.max).toBe(7);
  });
});
