/**
 * Merge-tag validation for templates and campaigns.
 *
 * Both render paths resolve an unknown tag to an empty string and an unknown
 * filter to a no-op, by design: strictVariables/strictFilters are off because
 * turning them on would make existing customer templates throw at send time.
 * That leaves a typo indistinguishable from an intentionally empty field —
 * `{{contact.frist_name}}` ships as "Vítejte, !", and the `{% if %}` form
 * drops a whole paragraph silently.
 *
 * This module is the alternative: report typos when the content is saved and
 * again in the pre-send panel, without changing what the renderer does.
 *
 * What it will and will not claim:
 *  - `contact.*` and `system.*` are namespaces we build ourselves, so an
 *    unknown key under them is a typo and is reported.
 *  - Anything else — `{{product.name}}`, `{{order.total}}`, a bare
 *    `{{promo_code}}` — may be supplied by the caller through ctx.data at run
 *    time. We cannot see that, so we never report it. A false "unknown tag"
 *    on content that works would train people to ignore the warnings.
 */

import {
  expandContactScope,
  expandSystemScope,
  listMergeFilters,
  type MergeTagContext,
} from './merge-tags.js';
import { listLiquidFilters } from './liquid.js';

export type MergeTagWarningKind = 'unknown_tag' | 'unknown_filter';

export interface MergeTagWarning {
  kind: MergeTagWarningKind;
  /** The offending token exactly as written, e.g. "contact.frist_name". */
  token: string;
  /** Customer-facing sentence. */
  message: string;
  /** Closest known name, when one is near enough to be worth suggesting. */
  suggestion?: string;
}

/** `{{ … }}` interpolation bodies. */
const OUTPUT_RE = /\{\{-?([\s\S]*?)-?\}\}/g;
/** `{% … %}` control-flow bodies. */
const CONTROL_RE = /\{%-?([\s\S]*?)-?%\}/g;
/** A namespaced reference we are able to check, wherever it appears. */
const NAMESPACED_RE = /\b(contact|system)((?:\.[A-Za-z_][\w]*)+)/g;
/** Quoted strings — stripped before filter scanning so `"a|b"` is not a pipe. */
const QUOTED_RE = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
/** Coupon-style `{{ campaign.id : CODE }}` tags, which are not merge tags. */
const COUPON_BODY_RE = /^[\w.]+\s*:\s*[\w-]+$/;

/**
 * Every key the two render paths can resolve for a given context.
 *
 * Derived from expandContactScope/expandSystemScope — the same two functions
 * that build the render context — so the validator cannot drift from the
 * renderer. Adding a field to the context automatically makes it valid in a
 * template; there is no second list to update.
 */
export function availableMergeKeys(ctx: MergeTagContext): Set<string> {
  const keys = new Set<string>();
  const contact = expandContactScope(ctx.contact);

  for (const k of Object.keys(contact)) {
    keys.add(k);
    keys.add(`contact.${k}`);
  }
  // custom_fields addresses the flat contact scope, so its members are
  // reachable through the nested form too.
  for (const ns of ['custom_fields', 'customFields']) {
    const nested = contact[ns];
    if (nested && typeof nested === 'object') {
      for (const k of Object.keys(nested as Record<string, unknown>)) {
        keys.add(`${ns}.${k}`);
        keys.add(`contact.${ns}.${k}`);
      }
    }
  }
  for (const k of Object.keys(expandSystemScope(ctx.system))) {
    keys.add(k);
    keys.add(`system.${k}`);
  }
  for (const k of Object.keys(ctx.data ?? {})) keys.add(k);
  return keys;
}

/** Filters both render paths know about: merge-tag registry ∪ Liquid engine. */
export function availableFilters(): Set<string> {
  return new Set([...listMergeFilters(), ...listLiquidFilters()]);
}

/**
 * Levenshtein distance, capped — only used to decide whether a suggestion is
 * close enough to show, so the exact value past the cap does not matter.
 */
function distance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function closest(token: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = distance(token, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // Scale the tolerance with length — one edit on a 4-letter name is already a
  // different word, whereas "vokativ"/"vocative" is two edits and obviously the
  // same intent. Capped at 3 so long keys do not start matching anything.
  return bestD <= Math.max(1, Math.min(3, Math.floor(token.length / 3))) ? best : undefined;
}

/** Strip quoted strings so their contents are never mistaken for syntax. */
function unquoted(body: string): string {
  return body.replace(QUOTED_RE, '""');
}

function scanFilters(template: string, known: Set<string>, out: Map<string, MergeTagWarning>) {
  for (const [, body] of template.matchAll(OUTPUT_RE)) {
    const clean = unquoted(body ?? '');
    // Skip the leading expression; everything after a `|` is a filter name.
    for (const [, name] of clean.matchAll(/\|\s*([A-Za-z_][\w]*)/g)) {
      if (!name || known.has(name)) continue;
      const key = `filter:${name}`;
      if (out.has(key)) continue;
      const suggestion = closest(name, known);
      out.set(key, {
        kind: 'unknown_filter',
        token: name,
        message:
          `Filtr „${name}" neexistuje — při odeslání se tiše přeskočí a hodnota ` +
          `se vypíše neupravená.` +
          (suggestion ? ` Nechtěli jste „${suggestion}"?` : ''),
        ...(suggestion ? { suggestion } : {}),
      });
    }
  }
}

function scanTags(template: string, available: Set<string>, out: Map<string, MergeTagWarning>) {
  const checkable = [...available].filter((k) => k.includes('.'));

  const report = (token: string) => {
    if (available.has(token)) return;
    const key = `tag:${token}`;
    if (out.has(key)) return;
    const suggestion = closest(token, checkable);
    out.set(key, {
      kind: 'unknown_tag',
      token,
      message:
        `Merge tag {{${token}}} neexistuje — při odeslání se vyrenderuje jako ` +
        `prázdný text.` +
        (suggestion ? ` Nechtěli jste {{${suggestion}}}?` : ''),
      ...(suggestion ? { suggestion } : {}),
    });
  };

  // Interpolation: {{ contact.frist_name | vocative }}
  for (const [, body] of template.matchAll(OUTPUT_RE)) {
    const expr = unquoted(body ?? '')
      .split('|')[0]!
      .trim();
    if (!expr || COUPON_BODY_RE.test(expr)) continue;
    const m = /^(contact|system)((?:\.[A-Za-z_][\w]*)+)$/.exec(expr);
    if (m) report(m[1]! + m[2]!);
  }

  // Control flow: {% if contact.frist_name %}, {% for x in contact.items %}.
  // This is the sharper form of the bug — a false condition removes the whole
  // block, so nothing appears in the output to hint that a tag was wrong.
  for (const [, body] of template.matchAll(CONTROL_RE)) {
    for (const [, ns, rest] of unquoted(body ?? '').matchAll(NAMESPACED_RE)) {
      report(ns! + rest!);
    }
  }
}

/**
 * Report merge tags and filters that cannot resolve.
 *
 * @param template  Raw template text (HTML or plain).
 * @param available Keys the context can resolve — build with availableMergeKeys.
 */
export function validateMergeTags(
  template: string,
  available: Iterable<string>,
  filters: Iterable<string> = availableFilters(),
): MergeTagWarning[] {
  if (!template || typeof template !== 'string') return [];
  const availableSet = available instanceof Set ? available : new Set(available);
  const filterSet = filters instanceof Set ? filters : new Set(filters);
  const out = new Map<string, MergeTagWarning>();
  scanTags(template, availableSet, out);
  scanFilters(template, filterSet, out);
  return [...out.values()];
}
