/**
 * Site messages + Web personalization pure helpers (#202/#203/#404).
 *
 * Trigger/condition evaluation engine shared by both services. Given a
 * visitor context (URL, time on site, segment membership, cart value, …)
 * and a list of condition rules, decide whether each message/rule should
 * fire.
 */

export type SiteTrigger =
  | 'page_visit'
  | 'time_on_site'
  | 'exit_intent'
  | 'scroll_depth'
  | 'cart_value'
  | 'returning_visitor'
  | 'segment_match'
  | 'custom_event';

export type ConditionOperator = 'eq' | 'contains' | 'gt' | 'gte' | 'lt' | 'in';

export interface SiteCondition {
  trigger: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface VisitorContext {
  url?: string;
  timeOnSiteSeconds?: number;
  scrollDepthPercent?: number;
  cartValue?: number;
  isReturningVisitor?: boolean;
  segmentIds?: string[];
  exitIntent?: boolean;
  customEvent?: string;
  customEventPayload?: Record<string, unknown>;
}

/**
 * Return true when every condition evaluates to true against the context
 * (AND semantics). An empty list matches anything.
 */
export function matchesAllConditions(conditions: SiteCondition[], ctx: VisitorContext): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => matchesCondition(c, ctx));
}

/** Evaluate a single condition. Unknown trigger/operator combos return false. */
export function matchesCondition(condition: SiteCondition, ctx: VisitorContext): boolean {
  switch (condition.trigger) {
    case 'page_visit':
      return evalString(ctx.url, condition.operator, condition.value);

    case 'time_on_site':
      return evalNumber(ctx.timeOnSiteSeconds, condition.operator, condition.value);

    case 'scroll_depth':
      return evalNumber(ctx.scrollDepthPercent, condition.operator, condition.value);

    case 'cart_value':
      return evalNumber(ctx.cartValue, condition.operator, condition.value);

    case 'exit_intent':
      return Boolean(ctx.exitIntent);

    case 'returning_visitor':
      return Boolean(ctx.isReturningVisitor);

    case 'segment_match': {
      if (!ctx.segmentIds) return false;
      if (condition.operator === 'in' && Array.isArray(condition.value)) {
        return (condition.value as string[]).some((id) => ctx.segmentIds!.includes(id));
      }
      if (condition.operator === 'eq' && typeof condition.value === 'string') {
        return ctx.segmentIds.includes(condition.value);
      }
      return false;
    }

    case 'custom_event': {
      if (condition.operator === 'eq' && typeof condition.value === 'string') {
        return ctx.customEvent === condition.value;
      }
      return false;
    }

    default:
      return false;
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

function evalString(actual: string | undefined, op: ConditionOperator, expected: unknown): boolean {
  if (actual === undefined) return false;
  const exp = String(expected ?? '');
  switch (op) {
    case 'eq':
      return actual === exp;
    case 'contains':
      return actual.includes(exp);
    default:
      return false;
  }
}

function evalNumber(actual: number | undefined, op: ConditionOperator, expected: unknown): boolean {
  if (actual === undefined) return false;
  const exp = Number(expected);
  if (!Number.isFinite(exp)) return false;
  switch (op) {
    case 'eq':
      return actual === exp;
    case 'gt':
      return actual > exp;
    case 'gte':
      return actual >= exp;
    case 'lt':
      return actual < exp;
    default:
      return false;
  }
}

// ─── Frequency capping ─────────────────────────────────────────────────────

/**
 * Should we show this message to the visitor right now?
 *   - `showOncePerVisitor=true` + seen ⇒ no
 *   - `cooldownMinutes` + last shown within cooldown ⇒ no
 *   - otherwise yes
 */
export function canShowMessage(params: {
  showOncePerVisitor?: boolean;
  seenByVisitor?: boolean;
  cooldownMinutes?: number;
  lastShownAt?: Date | null;
  now?: Date;
}): boolean {
  if (params.showOncePerVisitor && params.seenByVisitor) return false;
  if (params.cooldownMinutes && params.lastShownAt) {
    const now = params.now ?? new Date();
    const diffMs = now.getTime() - params.lastShownAt.getTime();
    if (diffMs < params.cooldownMinutes * 60_000) return false;
  }
  return true;
}
