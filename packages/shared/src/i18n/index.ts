/**
 * System-email i18n resolver (#363/#385).
 *
 * Exposes a locale-aware `t()` that looks up keys in the bundled locale
 * modules and interpolates `{{name}}` placeholders. Default locale is `cs`
 * because ForgeMsg launches on the CZ market first (see project memory
 * "Launch market = CZ").
 *
 * Usage:
 *   import { t, resolveLocale } from '@forgemsg/shared';
 *   const locale = resolveLocale({ orgLocale, acceptLanguage });
 *   t('doi_confirmed_page.heading', locale);
 *   t('common.footer_sent_by', locale, { org: 'Acme' });
 */

import type { EmailsBundle } from './types.js';
import { cs } from './emails.cs.js';
import { sk } from './emails.sk.js';
import { en } from './emails.en.js';

export type SupportedLocale = 'cs' | 'sk' | 'en';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['cs', 'sk', 'en'];

const BUNDLES: Record<SupportedLocale, EmailsBundle> = { cs, sk, en };

/** Default locale — CZ-first launch (see §19 of TODO.md). */
export const DEFAULT_LOCALE: SupportedLocale = 'cs';

/**
 * Resolve a locale from the strongest signal available.
 *
 * Precedence:
 *   1. Explicit `orgLocale` (from organizations.settings.locale)
 *   2. `contactLocale` (from contacts.locale / custom field)
 *   3. First tag of `Accept-Language` header
 *   4. DEFAULT_LOCALE (`cs`)
 */
export function resolveLocale(input: {
  orgLocale?: string | null;
  contactLocale?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  return (
    toSupported(input.orgLocale) ||
    toSupported(input.contactLocale) ||
    parseAcceptLanguage(input.acceptLanguage) ||
    DEFAULT_LOCALE
  );
}

/**
 * Look up a dot-separated key in the given locale's bundle and interpolate
 * `{{placeholder}}` values. Missing keys fall back to the English bundle; if
 * still missing, returns the key itself so dev-time mistakes are visible
 * without crashing the response.
 */
export function t(
  key: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
  values: Record<string, string | number> = {},
): string {
  const raw = lookup(BUNDLES[locale], key) ?? lookup(BUNDLES.en, key);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) =>
    String(values[name] ?? `{{${name}}}`),
  );
}

// ─── Internals ────────────────────────────────────────────────────────────────

function toSupported(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null;
  const tag = value.toLowerCase().split(/[-_]/)[0];
  return tag && (SUPPORTED_LOCALES as readonly string[]).includes(tag)
    ? (tag as SupportedLocale)
    : null;
}

function parseAcceptLanguage(header: string | null | undefined): SupportedLocale | null {
  if (!header) return null;
  const ranges = header
    .split(',')
    .map((r) => {
      const [tag, ...params] = r.trim().split(';');
      const qPart = params.find((p) => p.trim().startsWith('q='));
      const q = qPart ? Number.parseFloat(qPart.trim().slice(2)) : 1;
      return { tag: (tag ?? '').trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((r) => r.tag.length > 0)
    .sort((a, b) => b.q - a.q);
  for (const r of ranges) {
    const mapped = toSupported(r.tag);
    if (mapped) return mapped;
  }
  return null;
}

function lookup(bundle: EmailsBundle, key: string): unknown {
  let node: unknown = bundle;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}
