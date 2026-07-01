/**
 * Probabilistic predictive model (buy-till-you-die flavoured), fit-free but
 * statistically grounded — a real upgrade over linear-extrapolation heuristics.
 *
 * Model (per contact):
 *  - Purchases ~ Poisson(λ·t). The individual rate λ is estimated with a
 *    Gamma–Poisson conjugate posterior so sparse customers shrink toward the
 *    population rate λ0 (fixes "confident CLV on a single purchase"):
 *        λ_post = (α + x) / (α/λ0 + T)
 *    where x = repeat purchases, T = observation window (days), α = prior weight.
 *  - "Still active" probability uses an exponential survival keyed to the
 *    customer's OWN cadence (1/λ_post): silent for one cadence → P≈0.37, three
 *    cadences → P≈0.05. Far more sensible than churn = days/180.
 *        P(alive) = exp(-t_since_last / interpurchase)
 *  - Everything downstream is derived from (λ_post, P(alive)), so the three
 *    scores are mutually consistent:
 *        E[purchases over H] = λ_post · H · P(alive)
 *        purchaseLikelihood  = 1 − exp(−E[purchases])      (P of ≥1 purchase)
 *        churnRisk           = 1 − P(alive)
 *        CLV                 = AOV · E[purchases] · margin
 */

export interface PredictiveInput {
  totalOrders: number;
  totalRevenue: number;
  totalOpens: number;
  totalClicks: number;
  totalSends: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

export interface PredictiveOptions {
  /** Prediction horizon in days (default 365). */
  horizonDays?: number;
  /** Gross margin applied to CLV (0..1, default 1 = revenue-based CLV). */
  margin?: number;
  /** Gamma prior weight (pseudo-periods, default 1). Higher → more shrinkage. */
  priorWeight?: number;
  /** Population purchase rate (orders per day) for shrinkage. Default small. */
  populationRatePerDay?: number;
  /** "Now" for testability. */
  nowMs?: number;
}

export interface PredictiveScores {
  clv: number;
  purchaseLikelihood: number;
  churnRisk: number;
  /** Expected number of future orders over the horizon. */
  expectedPurchases: number;
  /** Typical days between orders (1/λ). null for non-buyers. */
  avgOrderIntervalDays: number | null;
  /** Average order value. */
  avgOrderValue: number;
}

const DAY = 86_400_000;

export function computePredictiveScores(
  row: PredictiveInput,
  opts: PredictiveOptions = {},
): PredictiveScores {
  const now = opts.nowMs ?? Date.now();
  const horizon = opts.horizonDays ?? 365;
  const margin = clamp(opts.margin ?? 1, 0, 1);
  const alpha = Math.max(0.01, opts.priorWeight ?? 1);
  // Sensible default population rate if the caller doesn't supply one
  // (~one purchase every 180 days).
  const lambda0 = opts.populationRatePerDay && opts.populationRatePerDay > 0
    ? opts.populationRatePerDay
    : 1 / 180;

  const aov = row.totalOrders > 0 ? row.totalRevenue / row.totalOrders : 0;

  // Observation window: from first order to now (min 1 day to avoid blow-ups).
  const T = row.firstOrderAt ? Math.max(1, (now - row.firstOrderAt.getTime()) / DAY) : 0;
  const tSinceLast = row.lastOrderAt ? (now - row.lastOrderAt.getTime()) / DAY : Infinity;

  // ── Non-buyer cold start: no purchase signal → engagement-only ──────────────
  if (row.totalOrders === 0 || T === 0) {
    const eng = engagementScore(row);
    return {
      clv: 0,
      // A purely engaged-but-never-purchased contact gets a capped likelihood.
      purchaseLikelihood: round3(0.3 * eng),
      // Churn only meaningful once they've engaged at all.
      churnRisk: round3(eng > 0.1 ? Math.min(0.5, 1 - eng) : 0.1),
      expectedPurchases: 0,
      avgOrderIntervalDays: null,
      avgOrderValue: round2(aov),
    };
  }

  // ── Gamma–Poisson posterior rate (shrinks sparse customers toward λ0) ───────
  // Repeat purchases x = totalOrders − 1 (the first order opens the window).
  const x = Math.max(0, row.totalOrders - 1);
  const lambdaPost = (alpha + x) / (alpha / lambda0 + T); // orders/day
  const interpurchase = 1 / lambdaPost; // days

  // ── Survival: probability still active given recency vs own cadence ─────────
  const pAlive = Number.isFinite(tSinceLast) ? Math.exp(-tSinceLast / interpurchase) : 0;

  // ── Derived, mutually-consistent scores ─────────────────────────────────────
  const expectedPurchases = lambdaPost * horizon * pAlive;
  const purchaseLikelihood = 1 - Math.exp(-expectedPurchases);
  const churnRisk = 1 - pAlive;
  const clv = aov * expectedPurchases * margin;

  return {
    clv: round2(Number.isFinite(clv) ? Math.max(0, clv) : 0),
    purchaseLikelihood: round3(clamp(purchaseLikelihood, 0, 1)),
    churnRisk: round3(clamp(churnRisk, 0, 1)),
    expectedPurchases: round2(Number.isFinite(expectedPurchases) ? Math.max(0, expectedPurchases) : 0),
    avgOrderIntervalDays: Number.isFinite(interpurchase) ? Math.round(interpurchase) : null,
    avgOrderValue: round2(aov),
  };
}

/** Engagement signal 0..1 — clicks weighted above opens, normalised by sends. */
export function engagementScore(row: {
  totalOpens: number;
  totalClicks: number;
  totalSends: number;
}): number {
  if (row.totalSends <= 0) return 0;
  return clamp((row.totalOpens * 0.4 + row.totalClicks * 1.0) / row.totalSends, 0, 1);
}

/**
 * Estimate a population purchase rate (orders/day) from per-contact aggregates,
 * used as the shrinkage prior λ0. Pools repeat purchases over total tenure of
 * buyers only.
 */
export function estimatePopulationRate(
  rows: Array<{ totalOrders: number; firstOrderAt: Date | null }>,
  nowMs: number = Date.now(),
): number {
  let repeatPurchases = 0;
  let buyerDays = 0;
  for (const r of rows) {
    if (r.totalOrders > 0 && r.firstOrderAt) {
      repeatPurchases += Math.max(0, r.totalOrders - 1);
      buyerDays += Math.max(1, (nowMs - r.firstOrderAt.getTime()) / DAY);
    }
  }
  if (buyerDays === 0 || repeatPurchases === 0) return 1 / 180; // weak default
  return repeatPurchases / buyerDays;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
