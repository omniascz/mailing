/**
 * Minimal merge tag parser.
 *
 * Syntax:
 *   {{field_name}}
 *   {{field_name|default:"fallback"}}
 *
 * Field resolution order:
 *   1. Top-level fields on the context (e.g. first_name, email)
 *   2. contact.custom_fields[field_name] if `field_name` is not top-level
 *   3. System fields (see SYSTEM_KEYS)
 *
 * Anything else → empty string (or the fallback).
 *
 * The parser is regex-based for the common {{merge}} case; templates that use
 * Liquid control-flow ({% for %} / {% if %}) are routed through the sandboxed
 * Liquid engine so loops and conditionals evaluate at send time.
 */

import { renderLiquidSync } from './liquid.js';

export interface MergeTagContact {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  [key: string]: unknown;
}

export interface MergeTagContext {
  contact?: MergeTagContact | null;
  system?: {
    unsubscribeUrl?: string;
    viewInBrowserUrl?: string;
    /** Signed token URL to the public preference center (Sprint D.1). */
    preferenceCenterUrl?: string;
    currentDate?: string;
    currentYear?: string;
    /** CAN-SPAM sender legal name + physical postal address. */
    companyName?: string;
    companyAddress?: string;
    /** Org-wide custom footer (SendGrid Mail Settings) appended to the body. */
    footerHtml?: string;
    footerText?: string;
    /**
     * Per-recipient vote links for `poll` blocks: block id → one signed URL per
     * option, in the block's own option order.
     *
     * Lives here rather than in RenderOptions because it is exactly the same
     * kind of value as `unsubscribeUrl` above — something only the sender can
     * mint, because it carries this recipient's identity. The renderer never
     * builds one; when the map is absent (previews, the archive page) the poll
     * renders its answers as plain text, which is the share block's rule too:
     * a link that cannot be honest is not rendered as a link.
     */
    pollUrls?: Record<string, string[]>;
  };
  /**
   * Arbitrary collections exposed to Liquid `{% for %}` loops (e.g. product
   * recommendations, order line items). Ignored by the regex merge-tag path.
   */
  data?: Record<string, unknown>;
}

const SYSTEM_KEYS = new Set([
  'unsubscribe_url',
  'view_in_browser_url',
  'preference_center_url',
  'current_date',
  'current_year',
  'company_name',
  'company_address',
]);

// Matches {{ field_name }} or {{ field_name | default: "fallback" }} or
// {{ field_name | vocative }} (#358 / #359 — locale filters).
// Multiple filters can be chained: {{ name | vocative | default: "zákazníku" }}.
const TAG_RE = /\{\{\s*([a-zA-Z][\w.]*)((?:\s*\|\s*[a-z_]+(?:\s*:\s*"(?:[^"\\]|\\.)*")?)*)\s*\}\}/g;
const FILTER_RE = /\|\s*([a-z_]+)(?:\s*:\s*"((?:[^"\\]|\\.)*)")?/g;

/**
 * Locale filter registry. Filters mutate the resolved value; wiring them in
 * the renderer keeps the parser free of locale-specific dependencies.
 *
 * Register Czech/Slovak filters from the apps/workers entrypoint so that we
 * don't pull the i18n packages into the browser bundle of the editor.
 */
export type MergeFilter = (value: string, arg?: string) => string;
const FILTERS: Record<string, MergeFilter> = {
  default: (v, arg) => (v === '' ? (arg ?? '') : v),
};

export function registerMergeFilter(name: string, fn: MergeFilter): void {
  FILTERS[name] = fn;
}

/**
 * Names of every filter the regex path can apply. The registry is the only
 * source — template validation must not carry a second copy of this list, or
 * registering a filter would silently make it "unknown".
 */
export function listMergeFilters(): string[] {
  return Object.keys(FILTERS);
}

/** snake_case → camelCase, e.g. first_name → firstName. */
function toCamel(field: string): string {
  return field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** camelCase → snake_case, e.g. firstName → first_name. */
function toSnake(field: string): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Every contact key the template may reference, in both conventions.
 *
 * This is THE source of truth for both render paths. It used to be two: the
 * regex path converted snake→camel per lookup, while the Liquid path carried a
 * hand-written list of two aliases applied only at top level. The result was
 * that `{{contact.first_name}}` resolved in one path and rendered empty in the
 * other — and `{{system.unsubscribeUrl}}` did the opposite.
 *
 * Priority is preserved from the original pickContactField: an explicit key
 * wins over its generated alias, so a contact carrying both `first_name` and
 * `firstName` keeps the behaviour it had.
 */
export function expandContactScope(
  contact: MergeTagContact | null | undefined,
): Record<string, unknown> {
  const c = (contact ?? {}) as Record<string, unknown>;
  const custom = (c['custom_fields'] ?? c['customFields']) as Record<string, unknown> | undefined;

  // Custom fields first so real contact props shadow them, matching the
  // original lookup order (direct key → camel → custom_fields).
  const out: Record<string, unknown> = { ...(custom ?? {}) };
  for (const [k, v] of Object.entries(c)) out[k] = v;

  // Generate the missing convention for every key. `??=` keeps explicit keys.
  for (const k of Object.keys({ ...out })) {
    const snake = toSnake(k);
    const camel = toCamel(k);
    if (!(snake in out)) out[snake] = out[k];
    if (!(camel in out)) out[camel] = out[k];
  }

  // `custom_fields` addresses the same flat scope. Production's
  // buildMergeContext spreads customFields straight into the contact, so there
  // is no nested object to point at — aliasing the scope makes
  // {{contact.custom_fields.plan}} resolve in both shapes.
  const nested = custom ?? out;
  out['custom_fields'] = nested;
  out['customFields'] = nested;
  return out;
}

function pickContactField(contact: MergeTagContact | null | undefined, field: string): unknown {
  if (!contact) return undefined;
  return resolvePath(expandContactScope(contact), field);
}

/** Resolve a dotted path ("custom_fields.plan") against a plain object. */
function resolvePath(scope: Record<string, unknown>, path: string): unknown {
  if (path in scope) return scope[path];
  const parts = path.split('.');
  let cur: unknown = scope;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const obj = cur as Record<string, unknown>;
    if (part in obj) {
      cur = obj[part];
      continue;
    }
    const camel = toCamel(part);
    const snake = toSnake(part);
    if (camel in obj) cur = obj[camel];
    else if (snake in obj) cur = obj[snake];
    else return undefined;
  }
  return cur;
}

/**
 * Every system value in both conventions, keyed the way templates address it.
 * Derived from one table so the two render paths cannot drift apart again.
 */
export function expandSystemScope(system: MergeTagContext['system']): Record<string, unknown> {
  const sys = system ?? {};
  const pairs: Array<[snake: string, value: unknown]> = [
    ['unsubscribe_url', sys.unsubscribeUrl],
    ['view_in_browser_url', sys.viewInBrowserUrl],
    ['preference_center_url', sys.preferenceCenterUrl],
    ['current_date', sys.currentDate ?? new Date().toISOString().slice(0, 10)],
    ['current_year', sys.currentYear ?? new Date().getFullYear().toString()],
    ['company_name', sys.companyName],
    ['company_address', sys.companyAddress],
    ['footer_html', sys.footerHtml],
    ['footer_text', sys.footerText],
  ];
  const out: Record<string, unknown> = {};
  for (const [snake, value] of pairs) {
    out[snake] = value ?? '';
    out[toCamel(snake)] = value ?? '';
  }
  return out;
}

function resolveSystem(ctx: MergeTagContext, field: string): string | undefined {
  if (!ctx.system) return undefined;
  const v = expandSystemScope(ctx.system)[field];
  return v == null || v === '' ? undefined : String(v);
}

/**
 * Replace every {{tag}} in `text` with its resolved value.
 * Never throws — unknown tags resolve to '' (or the fallback if provided).
 *
 * Supports dotted-path notation for the contact namespace:
 *   {{contact.first_name|vocative}} — resolves ctx.contact.first_name then applies filter
 *   {{first_name|vocative}}         — resolves ctx.contact.first_name (same, flat form)
 *   {{system.unsubscribe_url}}      — equivalent to {{unsubscribe_url}}
 *
 * When the text contains Liquid control-flow tags ({% for %}, {% if %}, …) it
 * is rendered through the sandboxed Liquid engine instead, so loops and
 * conditionals over arrays (product recommendations, order line items, array
 * custom-fields) are evaluated at send time. Pure {{merge}} templates keep the
 * fast regex path unchanged.
 */
export function parseMergeTags(text: string, ctx: MergeTagContext = {}): string {
  if (!text || typeof text !== 'string') return text ?? '';
  if (LIQUID_CONTROL_RE.test(text)) {
    const rendered = renderWithLiquid(text, ctx);
    if (rendered !== null) return rendered;
    // Malformed Liquid → degrade gracefully to the regex pass rather than
    // dropping the recipient's email.
  }
  return regexMergeTags(text, ctx);
}

function regexMergeTags(text: string, ctx: MergeTagContext = {}): string {
  return text.replace(TAG_RE, (_, field: string, filterChain: string) => {
    const filters = parseFilters(filterChain ?? '');

    // Strip dotted namespace prefixes: "contact.x" → "x", "system.x" → "x" (system)
    let resolvedField = field;
    let isSystem = false;
    if (field.startsWith('contact.')) {
      resolvedField = field.slice('contact.'.length);
    } else if (field.startsWith('system.')) {
      resolvedField = field.slice('system.'.length);
      isSystem = true;
    }

    let value: string;
    if (isSystem || SYSTEM_KEYS.has(resolvedField)) {
      const sys = resolveSystem(ctx, resolvedField);
      value = sys != null ? String(sys) : '';
    } else {
      const v = pickContactField(ctx.contact, resolvedField);
      value = v == null ? '' : String(v);
    }

    for (const { name, arg } of filters) {
      const fn = FILTERS[name];
      if (!fn) continue;
      value = fn(value, arg);
    }
    return value;
  });
}

// Presence of a Liquid control tag ({% ... %}) routes rendering through Liquid.
const LIQUID_CONTROL_RE = /\{%/;
// Unique-coupon tags ({{coupon_code:batchId}}) are resolved per-recipient AFTER
// the template render (batch-sender step 4a). Liquid would choke on the colon,
// so we shield them behind a sentinel across the Liquid pass and restore after.
const COUPON_TAG_RE = /\{\{\s*[\w.]+\s*:\s*[\w-]+\s*\}\}/g;
const COUPON_SENTINEL_RE = /%%CPN(\d+)%%/g;

/**
 * Flatten a MergeTagContext into a Liquid variable scope. Contact fields and
 * system values are exposed both at top level (so {{first_name}} /
 * {{unsubscribe_url}} work the same as in the regex path) and under their
 * `contact` / `system` namespaces (so {{contact.first_name}} works too). Array
 * custom-fields and any explicit `data` collections become loopable.
 */
function buildLiquidContext(ctx: MergeTagContext): Record<string, unknown> {
  const contactScope = expandContactScope(ctx.contact);
  const systemScope = expandSystemScope(ctx.system);
  return {
    // Flat access — {{first_name}} / {{firstName}} / {{unsubscribe_url}}.
    ...contactScope,
    ...systemScope,
    // Namespaced access — {{contact.first_name}} / {{system.unsubscribeUrl}}.
    // Same objects, so the two forms cannot disagree.
    contact: contactScope,
    system: systemScope,
    // Explicit loop collections passed by the caller (products, items, …).
    ...(ctx.data ?? {}),
  };
}

/**
 * Render a Liquid-containing template. Returns null (so the caller can fall
 * back to the regex pass) if the template is malformed — parseMergeTags must
 * never throw.
 */
function renderWithLiquid(text: string, ctx: MergeTagContext): string | null {
  const coupons: string[] = [];
  const shielded = text.replace(COUPON_TAG_RE, (m) => {
    const i = coupons.push(m) - 1;
    return `%%CPN${i}%%`;
  });
  try {
    const out = renderLiquidSync(shielded, buildLiquidContext(ctx));
    return out.replace(COUPON_SENTINEL_RE, (_, i: string) => coupons[Number(i)] ?? '');
  } catch {
    return null;
  }
}

function parseFilters(chain: string): Array<{ name: string; arg?: string }> {
  if (!chain) return [];
  const out: Array<{ name: string; arg?: string }> = [];
  FILTER_RE.lastIndex = 0;
  for (const match of chain.matchAll(FILTER_RE)) {
    const name = match[1];
    const arg = match[2]?.replace(/\\"/g, '"');
    if (name) out.push({ name, arg });
  }
  return out;
}

/**
 * List all merge tags referenced in a string, de-duplicated, preserving
 * source order. Useful for the "missing data" preview warnings.
 */
export function listMergeTags(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(TAG_RE)) {
    const field = match[1];
    if (field && !seen.has(field)) {
      seen.add(field);
      out.push(field);
    }
  }
  return out;
}
