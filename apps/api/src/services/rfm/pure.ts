/**
 * RFM quantile math (pure, unit-tested).
 *
 * Scores are assigned by org-relative quintiles, not fixed thresholds: a
 * contact's R/F/M is 1–5 based on where its value falls among ALL the org's
 * buyers. We use the standard type-7 (linear interpolation) quantile — the same
 * definition numpy/R use by default — rather than nearest-rank, so cut points
 * sit between data points and the buckets split more evenly.
 */

/** Type-7 quantile of an ascending-sorted array. p ∈ [0,1]. */
export function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0]!;
  const idx = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

export type QuintileCuts = readonly [number, number, number, number];

/** The 20/40/60/80 quintile cut points of an ascending-sorted array. */
export function quintileCuts(sortedAsc: number[]): QuintileCuts {
  return [
    quantile(sortedAsc, 0.2),
    quantile(sortedAsc, 0.4),
    quantile(sortedAsc, 0.6),
    quantile(sortedAsc, 0.8),
  ];
}

/**
 * Map a value to a 1–5 quintile score against the cut points.
 * `invert` is for recency (fewer days since last order = better = higher score).
 */
export function scoreQuintile(value: number, cuts: QuintileCuts, invert = false): number {
  const [c1, c2, c3, c4] = cuts;
  let s: number;
  if (value <= c1) s = 1;
  else if (value <= c2) s = 2;
  else if (value <= c3) s = 3;
  else if (value <= c4) s = 4;
  else s = 5;
  return invert ? 6 - s : s;
}
