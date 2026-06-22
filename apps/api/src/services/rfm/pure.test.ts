import { describe, it, expect } from 'vitest';
import { quantile, quintileCuts, scoreQuintile } from './pure.js';

describe('quantile (type-7 linear interpolation)', () => {
  it('matches the numpy/R default on a simple array', () => {
    const a = [1, 2, 3, 4, 5];
    expect(quantile(a, 0)).toBe(1);
    expect(quantile(a, 1)).toBe(5);
    expect(quantile(a, 0.5)).toBe(3);
    expect(quantile(a, 0.25)).toBe(2); // (5-1)*0.25 = 1 → a[1]
  });

  it('interpolates between data points', () => {
    // (4-1)*0.5 = 1.5 → between a[1]=20 and a[2]=30 → 25
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it('handles empty + single-element arrays', () => {
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([42], 0.5)).toBe(42);
  });

  it('clamps p to [0,1]', () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
  });
});

describe('scoreQuintile', () => {
  const cuts = quintileCuts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // ~[2.8, 4.6, 6.4, 8.2]

  it('assigns 1..5 across the range', () => {
    expect(scoreQuintile(1, cuts)).toBe(1);
    expect(scoreQuintile(10, cuts)).toBe(5);
    expect(scoreQuintile(5, cuts)).toBe(3);
  });

  it('inverts for recency (fewer days → higher score)', () => {
    // recency cuts in days; a small value (recent) should score 5 when inverted.
    expect(scoreQuintile(1, cuts, true)).toBe(5);
    expect(scoreQuintile(10, cuts, true)).toBe(1);
  });

  it('splits a uniform 0..99 distribution into ~even quintiles', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i);
    const c = quintileCuts(vals);
    const counts = [0, 0, 0, 0, 0];
    for (const v of vals) counts[scoreQuintile(v, c) - 1]!++;
    // each quintile should hold roughly a fifth (±a few from boundary ties)
    for (const cnt of counts) {
      expect(cnt).toBeGreaterThan(10);
      expect(cnt).toBeLessThan(30);
    }
  });

  it('degenerate (all-equal) data → all land in the same bucket without NaN', () => {
    const c = quintileCuts([3, 3, 3, 3, 3]);
    expect(scoreQuintile(3, c)).toBe(1); // value <= c1 → 1, deterministic
    expect(Number.isFinite(scoreQuintile(3, c))).toBe(true);
  });
});
