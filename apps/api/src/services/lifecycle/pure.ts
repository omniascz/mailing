/**
 * Lifecycle-stage pure helpers (#317/#394).
 *
 * Captures the ordering + transition rules. HubSpot uses a linear ordering
 * (subscriber → lead → MQL → SQL → opportunity → customer → evangelist)
 * where "other" sits outside the pipeline; the service rejects downgrades
 * unless explicitly permitted.
 */

export type LifecycleStage =
  | 'subscriber'
  | 'lead'
  | 'marketing_qualified_lead'
  | 'sales_qualified_lead'
  | 'opportunity'
  | 'customer'
  | 'evangelist'
  | 'other';

/** Ordered list of stages in the canonical HubSpot pipeline. */
export const LIFECYCLE_PIPELINE: readonly LifecycleStage[] = [
  'subscriber',
  'lead',
  'marketing_qualified_lead',
  'sales_qualified_lead',
  'opportunity',
  'customer',
  'evangelist',
];

/** All stages including the off-pipeline "other" bucket. */
export const LIFECYCLE_STAGES: readonly LifecycleStage[] = [...LIFECYCLE_PIPELINE, 'other'];

export function isLifecycleStage(value: unknown): value is LifecycleStage {
  return typeof value === 'string' && (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

/** Pipeline position (0-indexed). `other` returns -1. */
export function lifecyclePosition(stage: LifecycleStage): number {
  return LIFECYCLE_PIPELINE.indexOf(stage);
}

/**
 * Can a contact transition from `from` → `to`?
 *
 * Rules:
 *   - Any stage → any stage is allowed when `allowDowngrade` is true.
 *   - Otherwise, the target position must be >= source position.
 *   - `other` is a terminal bucket: moving into it always allowed;
 *     moving out requires allowDowngrade.
 */
export function canTransition(
  from: LifecycleStage,
  to: LifecycleStage,
  opts: { allowDowngrade?: boolean } = {},
): boolean {
  if (from === to) return false; // no-op transition

  if (opts.allowDowngrade) return true;

  if (to === 'other') return true;
  if (from === 'other') return false;

  return lifecyclePosition(to) > lifecyclePosition(from);
}

/**
 * Given a contact's inputs (tags/events), suggest the highest-matching
 * stage it should belong to. Used by workflow automations as a default
 * targeting helper — callers still drive explicit transitions.
 */
export function suggestedStageFromSignals(signals: {
  hasOptedIn?: boolean;
  hasEnrichedProfile?: boolean;
  hasMarketingEngagement?: boolean;
  hasSalesEngagement?: boolean;
  hasOpenOpportunity?: boolean;
  hasClosedWonDeal?: boolean;
  hasReferred?: boolean;
}): LifecycleStage {
  if (signals.hasReferred) return 'evangelist';
  if (signals.hasClosedWonDeal) return 'customer';
  if (signals.hasOpenOpportunity) return 'opportunity';
  if (signals.hasSalesEngagement) return 'sales_qualified_lead';
  if (signals.hasMarketingEngagement) return 'marketing_qualified_lead';
  if (signals.hasEnrichedProfile) return 'lead';
  if (signals.hasOptedIn) return 'subscriber';
  return 'other';
}
