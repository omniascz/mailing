/**
 * AI-sales pure helpers (#196/#398).
 *
 * Score computation for deal-risk + Win Probability extracted so the math is
 * testable without the DB. The full services in `deal-risk.ts` and
 * `win-probability.ts` load deal rows then delegate here.
 */

export interface DealRiskFlags {
  stalled: boolean;
  overdue: boolean;
  silent: boolean;
  highValue: boolean;
}

export type DealRiskSeverity = 'low' | 'medium' | 'high';

export interface DealRiskSignals {
  daysInCurrentStage: number;
  daysSinceLastActivity: number;
  daysPastExpectedClose: number;
  value: number;
  currency: string;
}

export interface DealRiskThresholds {
  stalledDays?: number;        // default 30
  silentDays?: number;         // default 21
  highValueThreshold?: number; // default 10_000
}

export interface DealRiskScore {
  riskScore: number;   // 0..100
  severity: DealRiskSeverity;
  flags: DealRiskFlags;
  reasons: string[];
}

/**
 * Pure scoring of deal-risk signals. Weights:
 *   stalled + 30, overdue + 35, silent + 20, high-value amplifier + 15.
 * Severity thresholds: >=60 high, >=30 medium, else low.
 */
export function scoreDealRisk(
  signals: DealRiskSignals,
  thresholds: DealRiskThresholds = {},
): DealRiskScore {
  const stalledDays = thresholds.stalledDays ?? 30;
  const silentDays = thresholds.silentDays ?? 21;
  const highValueThreshold = thresholds.highValueThreshold ?? 10_000;

  const flags: DealRiskFlags = {
    stalled: signals.daysInCurrentStage >= stalledDays,
    overdue: signals.daysPastExpectedClose > 0,
    silent: signals.daysSinceLastActivity >= silentDays,
    highValue: signals.value >= highValueThreshold,
  };

  const reasons: string[] = [];
  let score = 0;
  if (flags.stalled) {
    score += 30;
    reasons.push(`Stalled ${signals.daysInCurrentStage}d in current stage`);
  }
  if (flags.overdue) {
    score += 35;
    reasons.push(`${signals.daysPastExpectedClose}d past expected close`);
  }
  if (flags.silent) {
    score += 20;
    reasons.push(`No activity for ${signals.daysSinceLastActivity}d`);
  }
  if (flags.highValue && (flags.stalled || flags.overdue || flags.silent)) {
    score += 15;
    reasons.push(`High-value deal (${signals.value} ${signals.currency})`);
  }
  score = Math.min(100, score);

  let severity: DealRiskSeverity = 'low';
  if (score >= 60) severity = 'high';
  else if (score >= 30) severity = 'medium';

  return { riskScore: score, severity, flags, reasons };
}

// ─── Sentiment labelling ────────────────────────────────────────────────────

/** Convert a raw -1..1 polarity into a three-class label. */
export function sentimentLabel(polarity: number): 'positive' | 'neutral' | 'negative' {
  if (polarity > 0.15) return 'positive';
  if (polarity < -0.15) return 'negative';
  return 'neutral';
}

/**
 * Aggregate a list of message polarities into a weighted score where more
 * recent messages matter more. `decayHalfLifeDays` controls how fast old
 * messages fade from the aggregate.
 */
export function weightedSentiment(
  items: Array<{ polarity: number; ageInDays: number }>,
  decayHalfLifeDays = 30,
): { score: number; label: 'positive' | 'neutral' | 'negative'; samples: number } {
  if (items.length === 0) {
    return { score: 0, label: 'neutral', samples: 0 };
  }
  let weightSum = 0;
  let weightedSum = 0;
  for (const item of items) {
    const weight = Math.pow(0.5, item.ageInDays / decayHalfLifeDays);
    weightedSum += item.polarity * weight;
    weightSum += weight;
  }
  const score = weightSum === 0 ? 0 : weightedSum / weightSum;
  return { score, label: sentimentLabel(score), samples: items.length };
}
