/**
 * Custom permission sets pure-logic helpers (#345).
 *
 * Resolves an effective permission set for a user from:
 *   1. Their baseline role (owner / admin / editor / viewer) → fixed
 *      capability list.
 *   2. Any custom permission sets assigned to them → union into the role list.
 *
 * Wildcard permissions:
 *   - `"*"` — every permission (typically owner-only).
 *   - `"campaigns:*"` — every action on campaigns.
 *
 * `hasPermission` matches both literal and wildcard rules.
 */

import type { UserRole } from '@forgemsg/shared';

/** Baseline permissions for each fixed role. */
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  owner: ['*'],
  admin: [
    'org:read', 'org:write',
    'members:read', 'members:write',
    'permission_sets:read', 'permission_sets:write',
    'campaigns:*',
    'contacts:*',
    'analytics:*',
    'webhooks:*',
    'workflows:*',
    'templates:*',
    'segments:*',
  ],
  editor: [
    'org:read',
    'campaigns:read', 'campaigns:write',
    'contacts:read', 'contacts:write',
    'analytics:read',
    'templates:read', 'templates:write',
    'segments:read', 'segments:write',
    'workflows:read', 'workflows:write',
  ],
  viewer: [
    'org:read',
    'campaigns:read',
    'contacts:read',
    'analytics:read',
    'templates:read',
    'segments:read',
    'workflows:read',
  ],
};

/**
 * Compute the effective union of permissions for a user from their role plus
 * the permissions arrays of all assigned custom permission sets. The result is
 * sorted + deduped for stable comparison.
 */
export function resolveEffectivePermissions(
  role: UserRole,
  permissionSets: ReadonlyArray<{ permissions: readonly string[] }>,
): string[] {
  const out = new Set<string>(ROLE_PERMISSIONS[role]);
  for (const ps of permissionSets) {
    for (const p of ps.permissions) {
      if (typeof p === 'string' && p.length > 0) out.add(p);
    }
  }
  return [...out].sort();
}

/**
 * Check whether `effectivePermissions` grants `required`. Supports `*` as
 * total wildcard and `prefix:*` as resource-scope wildcard.
 */
export function hasPermission(effectivePermissions: readonly string[], required: string): boolean {
  if (!required || typeof required !== 'string') return false;
  for (const p of effectivePermissions) {
    if (p === '*') return true;
    if (p === required) return true;
    if (p.endsWith(':*')) {
      const prefix = p.slice(0, -1); // includes colon
      if (required.startsWith(prefix)) return true;
    }
  }
  return false;
}

/**
 * Reject permission strings the API shouldn't accept (empty, whitespace,
 * malformed wildcards). Returns the first offender or null when valid.
 */
export function findInvalidPermission(permissions: readonly string[]): string | null {
  for (const p of permissions) {
    if (typeof p !== 'string') return String(p);
    const trimmed = p.trim();
    if (!trimmed) return p;
    // resource[:action] | resource:* | *
    if (trimmed === '*') continue;
    if (!/^[a-z][a-z0-9_]*(:(\*|[a-z][a-z0-9_]*))?$/.test(trimmed)) return p;
  }
  return null;
}

/** Dedupe + sort + drop empty entries. */
export function canonicalisePermissions(permissions: readonly string[]): string[] {
  return [...new Set(permissions.filter((p) => typeof p === 'string' && p.trim().length > 0))].sort();
}
