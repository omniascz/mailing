/**
 * Multi-language content framework pure helpers (#338/#408).
 *
 * Locale fallback resolution + block-walk translation plumbing that does not
 * depend on Claude/DB. The runtime service in `translation.ts` uses these
 * primitives to pick the right variant for each recipient and to rewrite
 * only the text keys inside a block JSON tree.
 */

/** Canonical language tag. Accepts `cs-CZ` / `cs_CZ` / `cs` — always returns lowercase language. */
export function parseLocale(locale: string): { language: string; region: string | null } {
  const trimmed = locale.trim();
  if (!trimmed) return { language: '', region: null };
  const parts = trimmed.toLowerCase().split(/[-_]/);
  return {
    language: parts[0] ?? '',
    region: parts[1]?.toUpperCase() ?? null,
  };
}

/**
 * Produce the fallback chain for content resolution. Given `cs-CZ` we try:
 *   cs-CZ → cs → <default> (if different)
 * Given just `cs` we try:
 *   cs → <default>
 */
export function localeFallbackChain(requested: string, defaultLocale = 'en'): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null) => {
    if (!value) return;
    const norm = value.toLowerCase();
    if (seen.has(norm)) return;
    seen.add(norm);
    chain.push(norm);
  };

  const parsed = parseLocale(requested);
  if (parsed.language && parsed.region) {
    push(`${parsed.language}-${parsed.region}`.toLowerCase());
  }
  if (parsed.language) push(parsed.language);

  const parsedDefault = parseLocale(defaultLocale);
  if (parsedDefault.language && parsedDefault.region) {
    push(`${parsedDefault.language}-${parsedDefault.region}`.toLowerCase());
  }
  if (parsedDefault.language) push(parsedDefault.language);

  return chain;
}

// ─── Content-variant resolution ─────────────────────────────────────────────

export interface LocaleVariant<T = unknown> {
  locale: string;
  content: T;
}

export interface ResolvedVariant<T = unknown> extends LocaleVariant<T> {
  matched: 'exact' | 'language' | 'default' | 'any';
}

/**
 * Pick the best variant for a requested locale using the fallback chain.
 *   - `exact` — full tag match (`cs-CZ`)
 *   - `language` — same language, different region
 *   - `default` — fell through to defaultLocale
 *   - `any` — nothing matched; returned the first variant so callers still
 *     get content to render.
 */
export function selectVariant<T>(
  variants: LocaleVariant<T>[],
  requested: string,
  defaultLocale = 'en',
): ResolvedVariant<T> | null {
  if (variants.length === 0) return null;
  const byLocale = new Map<string, LocaleVariant<T>>();
  for (const v of variants) byLocale.set(v.locale.toLowerCase(), v);

  const parsed = parseLocale(requested);
  const exactTag = parsed.region ? `${parsed.language}-${parsed.region}`.toLowerCase() : null;

  if (exactTag) {
    const hit = byLocale.get(exactTag);
    if (hit) return { ...hit, matched: 'exact' };
  }

  if (parsed.language) {
    // Same-language, any region
    const languageHit =
      byLocale.get(parsed.language) ??
      [...byLocale.values()].find((v) => parseLocale(v.locale).language === parsed.language);
    if (languageHit) return { ...languageHit, matched: 'language' };
  }

  const defaultParsed = parseLocale(defaultLocale);
  const defaultTag = defaultParsed.region
    ? `${defaultParsed.language}-${defaultParsed.region}`.toLowerCase()
    : defaultParsed.language;
  const defaultHit =
    byLocale.get(defaultTag) ??
    [...byLocale.values()].find((v) => parseLocale(v.locale).language === defaultParsed.language);
  if (defaultHit) return { ...defaultHit, matched: 'default' };

  const [first] = variants;
  return first ? { ...first, matched: 'any' } : null;
}

// ─── Block-tree text walker ────────────────────────────────────────────────

/**
 * Keys whose values are treated as translatable text. Anything else
 * (structure, IDs, URLs, attributes) is left intact.
 */
export const TRANSLATABLE_KEYS = new Set([
  'text',
  'content',
  'html',
  'altText',
  'buttonText',
  'subject',
  'preheader',
  'label',
  'heading',
  'title',
  'caption',
  'description',
]);

export interface TextNode {
  /** JSON-pointer-style path, e.g. `/blocks/2/text`. */
  path: string;
  value: string;
}

/**
 * Collect every translatable string in a block tree. Walks arrays + objects
 * recursively and yields `{ path, value }` tuples so downstream can send
 * the list to Claude and later merge translations back by path.
 */
export function collectTextNodes(root: unknown): TextNode[] {
  const out: TextNode[] = [];
  walk(root, '', out);
  return out;
}

function walk(node: unknown, path: string, out: TextNode[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}/${i}`, out));
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = `${path}/${key}`;
    if (typeof value === 'string' && TRANSLATABLE_KEYS.has(key) && value.trim().length > 0) {
      out.push({ path: childPath, value });
    } else {
      walk(value, childPath, out);
    }
  }
}

/**
 * Apply a `{ path → translated value }` map back onto a cloned block tree.
 * Merge tags (`{{name}}`) in the original are preserved only if the Claude
 * translation didn't mangle them; this function just writes strings — the
 * caller is responsible for validating merge-tag integrity first.
 */
export function applyTranslations<T>(root: T, translations: Map<string, string>): T {
  const clone = structuredClone(root);
  applyInPlace(clone, '', translations);
  return clone;
}

function applyInPlace(node: unknown, path: string, translations: Map<string, string>): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => applyInPlace(item, `${path}/${i}`, translations));
    return;
  }
  if (typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const childPath = `${path}/${key}`;
    const existing = obj[key];
    if (typeof existing === 'string' && TRANSLATABLE_KEYS.has(key) && translations.has(childPath)) {
      obj[key] = translations.get(childPath)!;
    } else {
      applyInPlace(existing, childPath, translations);
    }
  }
}

// ─── Merge-tag preservation check ───────────────────────────────────────────

const MERGE_TAG_RE = /\{\{\s*[^}]+\s*\}\}/g;

export interface MergeTagValidation {
  ok: boolean;
  missing: string[];
  extra: string[];
}

/**
 * Ensure a translation preserves the set of merge tags from the original.
 * Returns the tags that were dropped + any new ones the translator added.
 */
export function validateMergeTags(original: string, translated: string): MergeTagValidation {
  const origTags = (original.match(MERGE_TAG_RE) ?? []).map((t) => t.trim()).sort();
  const transTags = (translated.match(MERGE_TAG_RE) ?? []).map((t) => t.trim()).sort();

  const origSet = new Set(origTags);
  const transSet = new Set(transTags);
  const missing = origTags.filter((t) => !transSet.has(t));
  const extra = transTags.filter((t) => !origSet.has(t));

  return {
    ok: missing.length === 0 && extra.length === 0,
    missing: [...new Set(missing)],
    extra: [...new Set(extra)],
  };
}
