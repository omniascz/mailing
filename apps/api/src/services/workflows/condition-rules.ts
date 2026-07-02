/**
 * Condition-rule normalization (pure).
 *
 * Workflow templates author conditions as { rule: { type, ... } } business
 * predicates, but the executor evaluates { field, op, value, withinDays }. This
 * translates the rule shapes we can evaluate with existing executor primitives
 * (email engagement events + custom-event log) into that contract.
 *
 * Rule types whose data location we cannot resolve without guessing
 * (feature_used, reordered_within, nps/csat scores, cart_value, cart_still_
 * abandoned, card_updated_within, email_replied) are mapped to an explicit
 * `unsupported:<type>` field so the executor treats them as a traceable
 * false-branch instead of a silent one. They stay listed here for future work.
 */

export interface NormalizedCondition {
  field: string;
  op?: string;
  value?: unknown;
  withinDays?: number;
}

interface RuleShape {
  rule?: { type?: string; days?: number; value?: unknown; eventName?: string };
  field?: string;
  op?: string;
  value?: unknown;
  withinDays?: number;
}

/** Rule types the executor can evaluate today. */
export const SUPPORTED_RULE_TYPES = [
  'email_opened',
  'email_clicked',
  'email_opened_within',
  'opened_email_within',
  'api_event_occurred',
] as const;

/**
 * Translate a condition config into the executor's field/op/value contract.
 * A config that already uses `field` is returned unchanged. A `rule`-shaped
 * config is mapped; unknown rule types become `unsupported:<type>`.
 */
export function normalizeConditionConfig(config: RuleShape): NormalizedCondition {
  // Already in executor contract.
  if (config.field) {
    return {
      field: config.field,
      op: config.op,
      value: config.value,
      withinDays: config.withinDays,
    };
  }

  const rule = config.rule;
  if (!rule || !rule.type) return { field: 'unsupported:missing_rule' };

  switch (rule.type) {
    case 'email_opened':
      return { field: 'email_opened', withinDays: rule.days };
    case 'email_clicked':
      return { field: 'email_clicked', withinDays: rule.days };
    case 'email_opened_within':
    case 'opened_email_within':
      return { field: 'email_opened', withinDays: rule.days };
    case 'api_event_occurred':
      return { field: 'api_event', op: 'occurred', value: rule.eventName, withinDays: rule.days };
    default:
      return { field: `unsupported:${rule.type}` };
  }
}

/** True when the (possibly rule-shaped) condition can be meaningfully evaluated. */
export function isConditionSupported(config: RuleShape): boolean {
  return !normalizeConditionConfig(config).field.startsWith('unsupported:');
}
