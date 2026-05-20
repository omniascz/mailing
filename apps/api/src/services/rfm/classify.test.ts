import { describe, it, expect } from 'vitest';
import { classifySegment, type RfmSegment } from './index.js';

/**
 * Pure-function tests for the RFM cohort mapper. The expectations follow
 * the Klaviyo lifecycle convention we mirrored — these tests pin the
 * branches so a reorder of the if-chain can't silently re-label a cohort.
 */
describe('classifySegment', () => {
  const cases: Array<{ r: number; f: number; m: number; expected: RfmSegment; why: string }> = [
    { r: 5, f: 5, m: 5, expected: 'champions', why: 'top of everything' },
    { r: 4, f: 4, m: 4, expected: 'champions', why: 'all-fours boundary' },
    { r: 3, f: 5, m: 2, expected: 'loyal', why: 'recent enough + many orders, low spend' },
    { r: 4, f: 2, m: 3, expected: 'potential_loyalists', why: 'recent buyers, mid spend' },
    { r: 5, f: 1, m: 1, expected: 'recent_customers', why: 'brand new, one-order' },
    { r: 3, f: 1, m: 1, expected: 'promising', why: 'one-order recent-ish buyer' },
    {
      r: 3,
      f: 3,
      m: 4,
      expected: 'needs_attention',
      why: 'mid recency+freq, spend above the "promising" m<=3 cutoff',
    },
    { r: 2, f: 3, m: 2, expected: 'about_to_sleep', why: 'slipping but engaged' },
    { r: 1, f: 5, m: 4, expected: 'cant_lose', why: 'used to buy a lot, gone quiet' },
    {
      r: 1,
      f: 3,
      m: 4,
      expected: 'at_risk',
      why: 'gap big enough to escape about_to_sleep, still solid spend',
    },
    { r: 1, f: 1, m: 1, expected: 'hibernating', why: 'low everything' },
    { r: 3, f: 2, m: 4, expected: 'lost', why: 'fallthrough — no other branch matches' },
  ];

  for (const c of cases) {
    it(`r=${c.r} f=${c.f} m=${c.m} → ${c.expected} (${c.why})`, () => {
      expect(classifySegment(c.r, c.f, c.m)).toBe(c.expected);
    });
  }

  it('covers every legal R×F×M triple without throwing', () => {
    const seen = new Set<RfmSegment>();
    for (let r = 1; r <= 5; r++) {
      for (let f = 1; f <= 5; f++) {
        for (let m = 1; m <= 5; m++) {
          seen.add(classifySegment(r, f, m));
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });
});
