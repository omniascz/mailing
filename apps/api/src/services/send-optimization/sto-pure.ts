/**
 * Per-contact send-time math — empirical-Bayes shrinkage toward the org's
 * population open-hour distribution.
 *
 * Why: a contact with a single recorded open should NOT be assigned a confident
 * "best hour" from that one data point (the old Laplace α=0.1 let one open
 * dominate). Here each contact's hour histogram is blended with a Dirichlet
 * prior (the org-wide hour distribution) weighted by κ pseudo-opens:
 *
 *     posterior[h] = (count[h] + κ · prior[h]) / (total + κ)
 *
 * With few opens the posterior ≈ the population's best hour; with many it ≈ the
 * contact's own pattern. Confidence = total / (total + κ) is the proper weight
 * placed on the contact's own data, not an ad-hoc ratio.
 */

export const HOURS = 24;
/** Prior strength in pseudo-opens. Confidence reaches 0.5 at κ real opens. */
export const KAPPA = 20;

/** A flat fallback prior when the org has no aggregate history yet. */
export function uniformPrior(): number[] {
  return new Array(HOURS).fill(1 / HOURS) as number[];
}

/** Normalise a 24-slot count vector into a probability distribution. */
export function normalizeHistogram(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return uniformPrior();
  return counts.map((c) => c / total);
}

export interface StoResult {
  bestHourUtc: number;
  secondBestHourUtc: number | null;
  confidence: number;
  /** Posterior hour-rate distribution (sums to ~1). */
  rates: number[];
  sampleSize: number;
}

/**
 * Empirical-Bayes posterior over send hours.
 * @param counts  per-hour open counts for the contact (length 24)
 * @param prior   org-wide hour distribution (length 24, sums to 1)
 * @param kappa   prior strength (pseudo-opens)
 */
export function computeStoFromCounts(
  counts: number[],
  prior: number[] = uniformPrior(),
  kappa: number = KAPPA,
): StoResult {
  const total = counts.reduce((a, b) => a + b, 0);
  const rates = new Array(HOURS).fill(0) as number[];
  for (let h = 0; h < HOURS; h++) {
    rates[h] = ((counts[h] ?? 0) + kappa * (prior[h] ?? 1 / HOURS)) / (total + kappa);
  }

  const indexed = rates.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r);
  const bestHourUtc = indexed[0]?.i ?? 10;
  const secondBestHourUtc = indexed[1]?.i ?? null;
  const confidence = total / (total + kappa);

  return { bestHourUtc, secondBestHourUtc, confidence, rates, sampleSize: total };
}
