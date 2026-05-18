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
 * The parser is intentionally regex-based — Liquid support (Fáze 2 later
 * task 2.11) will layer on top via a dedicated renderer.
 */

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
    currentDate?: string;
    currentYear?: string;
  };
}

const SYSTEM_KEYS = new Set([
  'unsubscribe_url',
  'view_in_browser_url',
  'current_date',
  'current_year',
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
    case 'current_date':
      return sys.currentDate ?? new Date().toISOString().slice(0, 10);
    case 'current_year':
      return sys.currentYear ?? new Date().getFullYear().toString();
    default:
      return undefined;
  }
}

/**
 * Replace every {{tag}} in `text` with its resolved value.
 * Never throws — unknown tags resolve to '' (or the fallback if provided).
 */
export function parseMergeTags(text: string, ctx: MergeTagContext = {}): string {
  if (!text || typeof text !== 'string') return text ?? '';
  return text.replace(TAG_RE, (_, field: string, filterChain: string) => {
    const filters = parseFilters(filterChain ?? '');

    let value: string;
    if (SYSTEM_KEYS.has(field)) {
      const sys = resolveSystem(ctx, field);
      value = sys != null ? String(sys) : '';
    } else {
      const v = pickContactField(ctx.contact, field);
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
