/**
 * Teams pure-logic helpers (#343).
 *
 * The actual Drizzle SQL builder (`teamScopeSql`) lives in index.ts because it
 * binds a Drizzle PgColumn. The decision tree that drives it — bypass / allowed
 * IDs / unowned visibility — is pure and lives here so we can regression-test
 * it without spinning the schema barrel.
 */

import type { UserRole } from '@forgemsg/shared';

export interface TeamContextLike {
  bypass: boolean;
  teamIds: string[];
}

/** Owners and admins always bypass team scoping; everyone else is restricted unless they have crossTeamAccess. */
export function deriveBypass(role: UserRole, crossTeamAccess: boolean): boolean {
  if (role === 'owner' || role === 'admin') return true;
  return crossTeamAccess;
}

export type TeamScopeDecision =
  | { kind: 'bypass' }
  | { kind: 'unowned-only' }
  | { kind: 'in-set'; teamIds: string[]; includeUnowned: boolean }
  | { kind: 'deny' };

/**
 * Decide what kind of filter to apply, independent of Drizzle. The SQL builder
 * in index.ts pattern-matches on this result.
 */
export function planTeamScope(
  ctx: TeamContextLike,
  opts?: { includeUnowned?: boolean },
): TeamScopeDecision {
  if (ctx.bypass) return { kind: 'bypass' };
  const includeUnowned = opts?.includeUnowned !== false;
  if (ctx.teamIds.length === 0) {
    return includeUnowned ? { kind: 'unowned-only' } : { kind: 'deny' };
  }
  return { kind: 'in-set', teamIds: ctx.teamIds, includeUnowned };
}

/** Pure write-access check: does the caller's context allow targeting `targetTeamId`? */
export function canWriteToTeam(
  ctx: TeamContextLike,
  targetTeamId: string | null | undefined,
): boolean {
  if (ctx.bypass) return true;
  if (targetTeamId == null) return true; // org-wide rows belong to nobody
  return ctx.teamIds.includes(targetTeamId);
}

/** Build the Redis cache key for a user's team membership. */
export function membershipCacheKey(orgId: string, userId: string): string {
  return `team_membership:${orgId}:${userId}`;
}

/** De-dupe and sort team IDs for a stable cache value. */
export function normaliseTeamIds(rows: Array<{ teamId: string }>): string[] {
  return [...new Set(rows.map((r) => r.teamId))].sort();
}

/** Aggregate crossTeamAccess across all of a user's memberships — any flag wins. */
export function anyCrossTeamAccess(rows: Array<{ crossTeamAccess: boolean }>): boolean {
  return rows.some((r) => r.crossTeamAccess);
}
