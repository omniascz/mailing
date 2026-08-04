/**
 * Lead-conversion model — fits per-org weights from the org's OWN outcomes
 * instead of hand-tuned global constants.
 *
 * Features are deliberately BEHAVIOURAL and pre-purchase (so the fit isn't a
 * tautology that just recovers order-derived signals):
 *   - leadScoreNorm : rule-based behavioural lead score / 200
 *   - openRate      : opens / sends
 *   - clickRate     : clicks / sends
 * Label: converted = the contact has ≥1 order.
 *
 * If the org doesn't have enough labelled data yet, trainLeadModel returns null
 * and callers fall back to the transparent heuristic in predictive.ts.
 */
import {
  trainLogistic,
  predictLogistic,
  type LogisticModel,
} from '../../lib/logistic-regression.js';

export interface LeadSample {
  leadScore: number;
  totalOpens: number;
  totalClicks: number;
  totalSends: number;
  converted: boolean;
}

export interface LeadFeatureInput {
  leadScore: number;
  totalOpens: number;
  totalClicks: number;
  totalSends: number;
}

const MIN_SAMPLES = 50;
const MIN_PER_CLASS = 8;

/** Extract the model feature vector from a contact's behavioural aggregates. */
export function leadFeatures(i: LeadFeatureInput): number[] {
  const sends = i.totalSends > 0 ? i.totalSends : 1;
  return [
    Math.min(1, (i.leadScore ?? 0) / 200),
    Math.min(1, i.totalOpens / sends),
    Math.min(1, i.totalClicks / sends),
  ];
}

/**
 * Fit a per-org lead model. Returns null when there isn't enough labelled data
 * (too few rows, or not both classes well-represented) — the caller then uses
 * the heuristic fallback.
 */
export function trainLeadModel(samples: LeadSample[]): LogisticModel | null {
  if (samples.length < MIN_SAMPLES) return null;
  const converted = samples.filter((s) => s.converted).length;
  if (converted < MIN_PER_CLASS || samples.length - converted < MIN_PER_CLASS) return null;

  const X = samples.map(leadFeatures);
  const y = samples.map((s) => (s.converted ? 1 : 0));
  return trainLogistic(X, y);
}

/** Calibrated conversion probability for one contact under a fitted model. */
export function scoreLeadProbability(model: LogisticModel, input: LeadFeatureInput): number {
  return predictLogistic(model, leadFeatures(input));
}
