/**
 * API-key scope map. Derives the scope a request requires from its method +
 * path, so a single global guard can enforce least-privilege across the whole
 * API surface instead of annotating every route.
 *
 * Backward compatible: the guard only enforces for keys that carry an explicit,
 * non-wildcard scope list (see requireScope). Legacy/unscoped keys and JWT
 * sessions are unaffected. Unmapped resources return null → never gated, so a
 * scoped key is never accidentally locked out of an endpoint we didn't classify.
 */

/** Resources gated with `<resource>:read` (GET/HEAD) + `<resource>:write`. */
export const GATED_RESOURCES = new Set([
  'contacts',
  'lists',
  'segments',
  'tags',
  'custom-fields',
  'custom-objects',
  'campaigns',
  'multivariate-tests',
  'rss-campaigns',
  'templates',
  'domains',
  'dedicated-ips',
  'dmarc',
  'bimi',
  'webhooks',
  'api-keys',
  'suppressions',
  'workflows',
  'coupons',
  'media',
  'signup-forms',
  'configuration-sets',
  'smtp-credentials',
  'email-identities',
  'inbound-rules',
  'topics',
]);

/** Read-only resources → always `<resource>:read`. */
export const READ_ONLY_RESOURCES = new Set(['analytics', 'benchmarks', 'deliverability']);

/** Resources whose writes are a message send → `emails:send`. */
export const SEND_RESOURCES = new Set(['transactional', 'emails', 'messaging']);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Extract the resource segment right after `/api/v1/` (ignoring query). */
export function resourceOf(path: string): string | null {
  const clean = path.split('?')[0] ?? '';
  const parts = clean.split('/').filter(Boolean); // ['api','v1','contacts',...]
  const i = parts.indexOf('v1');
  if (i === -1 || i + 1 >= parts.length) return null;
  return parts[i + 1] ?? null;
}

/**
 * The scope this request requires, or null if the route is not scope-gated.
 */
export function requiredScopeFor(method: string, path: string): string | null {
  const resource = resourceOf(path);
  if (!resource) return null;

  const isRead = READ_METHODS.has(method.toUpperCase());

  if (SEND_RESOURCES.has(resource)) {
    return isRead ? 'emails:read' : 'emails:send';
  }
  if (READ_ONLY_RESOURCES.has(resource)) {
    return `${resource}:read`;
  }
  if (GATED_RESOURCES.has(resource)) {
    return isRead ? `${resource}:read` : `${resource}:write`;
  }
  return null;
}

/**
 * Decide whether a key's scope set satisfies the request. Mirrors requireScope
 * semantics: undefined (JWT), empty (legacy), or '*' → allowed.
 */
export function scopeAllows(scopes: string[] | undefined, method: string, path: string): boolean {
  if (scopes === undefined || scopes.length === 0 || scopes.includes('*')) return true;
  const required = requiredScopeFor(method, path);
  if (!required) return true; // route not gated
  return scopes.includes(required);
}
