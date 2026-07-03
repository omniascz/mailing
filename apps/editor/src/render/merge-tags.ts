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

function pickContactField(contact: MergeTagContact | null | undefined, field: string): unknown {
  if (!contact) return undefined;
  // Direct lookup first (supports both snake_case source columns AND camelCase
  // TypeScript props; callers usually flatten to one or the other).
  if (field in contact) return contact[field];
  // Snake → camel, e.g. first_name → firstName
  const camel = field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  if (camel in contact) return contact[camel];
  // custom_fields lookup
  const custom = contact['custom_fields'] ?? contact['customFields'];
  if (custom && typeof custom === 'object' && field in (custom as Record<string, unknown>)) {
    return (custom as Record<string, unknown>)[field];
  }
  return undefined;
}

function resolveSystem(ctx: MergeTagContext, field: string): string | undefined {
  const sys = ctx.system;
  if (!sys) return undefined;
  switch (field) {
    case 'unsubscribe_url':
      return sys.unsubscribeUrl;
    case 'view_in_browser_url':
      return sys.viewInBrowserUrl;
    case 'preference_center_url':
      return sys.preferenceCenterUrl;
    case 'current_date':
      return sys.currentDate ?? new Date().toISOString().slice(0, 10);
    case 'current_year':
      return sys.currentYear ?? new Date().getFullYear().toString();
    case 'company_name':
      return sys.companyName;
    case 'company_address':
      return sys.companyAddress;
    default:
      return undefined;
  }
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
  const c = (ctx.contact ?? {}) as Record<string, unknown>;
  const custom = (c['custom_fields'] ?? c['customFields'] ?? {}) as Record<string, unknown>;
  const sys = ctx.system ?? {};
  const contactScope = { ...custom, ...c };
  return {
    ...contactScope,
    // snake_case aliases for the common camelCase contact props
    first_name: c['firstName'] ?? c['first_name'],
    last_name: c['lastName'] ?? c['last_name'],
    // system values flattened to top level
    unsubscribe_url: sys.unsubscribeUrl ?? '',
    view_in_browser_url: sys.viewInBrowserUrl ?? '',
    preference_center_url: sys.preferenceCenterUrl ?? '',
    current_date: sys.currentDate ?? new Date().toISOString().slice(0, 10),
    current_year: sys.currentYear ?? new Date().getFullYear().toString(),
    company_name: sys.companyName ?? '',
    company_address: sys.companyAddress ?? '',
    // namespaced access
    contact: contactScope,
    system: sys,
    // explicit loop collections passed by the caller (products, items, …)
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
