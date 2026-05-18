/**
 * Field-level permissions pure-logic helpers (#344).
 *
 * The DB-bound resolver in index.ts loads a rule for (org, role, entity) and
 * caches it in Redis. Once the rule is in hand, every read/write check is
 * synchronous, deterministic, and benefits from being unit-tested without
 * spinning the schema barrel.
 */

export interface FieldRule {
  /** Field names the role can read. `'*'` means "all fields not in `hidden`". */
  readable: string[];
  /** Field names that are stripped even if `readable` says `'*'`. */
  hidden: string[];
  /** Field names the role can write. `'*'` means "any field". */
  writable: string[];
}

/** Apply the read-side rule to a single object. Null rule = passthrough. */
export function applyReadRule<T extends Record<string, unknown>>(
  rule: FieldRule | null,
  obj: T,
): Partial<T> {
  if (!rule) return obj;
  const readableAll = rule.readable.includes('*');
  const hidden = new Set(rule.hidden);
  const allow = new Set(rule.readable);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (hidden.has(k)) continue;
    if (readableAll || allow.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}

/** Decide whether a write patch is allowed under the rule. Returns the first offending key (if any). */
export function findUnwritableField(
  rule: FieldRule | null,
  patch: Record<string, unknown>,
): string | null {
  if (!rule) return null;
  if (rule.writable.includes('*')) return null;
  const allowed = new Set(rule.writable);
  for (const k of Object.keys(patch)) {
    if (!allowed.has(k)) return k;
  }
  return null;
}

/** Build the Redis cache key. Kept here so the cache layout is asserted by a test. */
export function fpermCacheKey(orgId: string, role: string, entity: string): string {
  return `fperm:${orgId}:${role}:${entity}`;
}

/** Default rule used when no row exists for (org, role, entity): wide-open. */
export function defaultRule(): FieldRule {
  return { readable: ['*'], hidden: [], writable: ['*'] };
}

/** Merge a partial patch onto a rule, preserving fields the caller didn't touch. */
export function mergeRule(existing: FieldRule, patch: Partial<FieldRule>): FieldRule {
  return {
    readable: patch.readable ?? existing.readable,
    hidden: patch.hidden ?? existing.hidden,
    writable: patch.writable ?? existing.writable,
  };
}
