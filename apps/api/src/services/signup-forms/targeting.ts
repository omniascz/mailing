/**
 * Form targeting + behaviour engine (pure).
 *
 * Decides whether a form is eligible to show for a given visitor + page, and
 * what trigger the client should arm (immediate/delay/scroll/exit intent).
 * Pure + deterministic (nowMs is injected) so it's fully unit-testable and can
 * run identically server-side or in the embed script.
 */

import type { FormTargeting, FormUrlRule } from '../../db/schema/signup-forms.js';

export interface VisitorContext {
  /** Current page URL (full href or path). */
  url?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  /** How many times this visitor has already seen the form. */
  impressionCount?: number;
  /** Last time the form was shown to this visitor (ms epoch). */
  lastSeenMs?: number | null;
  /** Whether this visitor has already submitted the form. */
  hasSubmitted?: boolean;
  /** Current time (ms epoch) — injected for determinism. */
  nowMs: number;
}

export interface TargetingDecision {
  /** Eligible to show (all where/frequency gates passed). */
  eligible: boolean;
  /** Machine-readable reason when not eligible. */
  reason?: 'url' | 'device' | 'cooldown' | 'max_impressions' | 'already_submitted';
  /** The trigger the client should arm when eligible. */
  trigger: {
    type: 'immediate' | 'delay' | 'scroll' | 'exit_intent';
    delaySeconds?: number;
    scrollPercent?: number;
  };
}

function matchOneUrl(rule: FormUrlRule, url: string): boolean {
  const u = url.toLowerCase();
  const v = rule.value.toLowerCase();
  switch (rule.match) {
    case 'contains':
      return u.includes(v);
    case 'not_contains':
      return !u.includes(v);
    case 'exact':
      return u === v;
    case 'starts_with':
      return u.startsWith(v);
    case 'regex':
      try {
        return new RegExp(rule.value, 'i').test(url);
      } catch {
        return false; // malformed pattern never matches
      }
  }
}

/** Evaluate URL rules with and/or logic. No rules → matches every page. */
export function matchUrlRules(
  rules: FormUrlRule[] | undefined,
  logic: 'and' | 'or' | undefined,
  url: string | undefined,
): boolean {
  if (!rules || rules.length === 0) return true;
  const href = url ?? '';
  return logic === 'and'
    ? rules.every((r) => matchOneUrl(r, href))
    : rules.some((r) => matchOneUrl(r, href));
}

const DEFAULT_TRIGGER: TargetingDecision['trigger'] = { type: 'immediate' };

function resolveTrigger(t: FormTargeting['trigger']): TargetingDecision['trigger'] {
  if (!t) return DEFAULT_TRIGGER;
  switch (t.type) {
    case 'delay':
      return { type: 'delay', delaySeconds: Math.max(0, t.delaySeconds ?? 5) };
    case 'scroll':
      return { type: 'scroll', scrollPercent: Math.min(100, Math.max(1, t.scrollPercent ?? 50)) };
    case 'exit_intent':
      return { type: 'exit_intent' };
    case 'immediate':
    default:
      return { type: 'immediate' };
  }
}

/**
 * Decide whether the form is eligible + what trigger to arm. Gates are checked
 * in order: submitted → max impressions → cooldown → device → url. The trigger
 * is always returned (the client only arms it when eligible).
 */
export function evaluateFormTargeting(
  targeting: FormTargeting | undefined,
  ctx: VisitorContext,
): TargetingDecision {
  const trigger = resolveTrigger(targeting?.trigger);
  if (!targeting) return { eligible: true, trigger };

  const freq = targeting.frequency;
  if (freq?.hideAfterSubmit && ctx.hasSubmitted) {
    return { eligible: false, reason: 'already_submitted', trigger };
  }
  if (freq?.maxImpressions != null && (ctx.impressionCount ?? 0) >= freq.maxImpressions) {
    return { eligible: false, reason: 'max_impressions', trigger };
  }
  if (freq?.cooldownDays != null && ctx.lastSeenMs) {
    const elapsed = ctx.nowMs - ctx.lastSeenMs;
    if (elapsed < freq.cooldownDays * 86_400_000) {
      return { eligible: false, reason: 'cooldown', trigger };
    }
  }

  if (targeting.devices && targeting.devices.length > 0) {
    if (!ctx.device || !targeting.devices.includes(ctx.device)) {
      return { eligible: false, reason: 'device', trigger };
    }
  }

  if (!matchUrlRules(targeting.urlRules, targeting.urlLogic, ctx.url)) {
    return { eligible: false, reason: 'url', trigger };
  }

  return { eligible: true, trigger };
}
