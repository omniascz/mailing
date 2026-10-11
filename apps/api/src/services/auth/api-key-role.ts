/**
 * The role an API key acts with (Z130).
 *
 * Every key used to act as admin, so a viewer who minted one became an admin
 * for every route behind requireRole — measured: the key sent a no-go campaign
 * with the gate overridden while the viewer's own session got 403.
 *
 * Now a key carries the role of the member who created it, never more:
 *  - stored on the key when it is created (api_keys.role), capped at owner —
 *    a platform system_admin's key is an owner's key, not a platform one;
 *  - and capped again on every lookup by the creator's current role in the
 *    key's organisation, so demoting a member demotes their keys and removing
 *    a member leaves their keys with viewer;
 *  - a key with no member behind it acts with the role it was issued with
 *    (platform-issued keys, e.g. partner provisioning), or viewer when it has
 *    none (a key from before the column whose creator could not be resolved).
 */
import { and, eq } from 'drizzle-orm';
import type { UserRole } from '@forgemsg/shared';
import { db } from '../../db/client.js';
import { organizationMembers, users } from '../../db/schema/index.js';

export type ApiKeyRole = 'owner' | 'admin' | 'editor' | 'viewer';

const RANK: Record<ApiKeyRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

/** A member's role as a key may carry it: anything above owner becomes owner, anything unknown viewer. */
export function keyRoleFor(role: string | null | undefined): ApiKeyRole {
  if (role === 'system_admin') return 'owner';
  return role && role in RANK ? (role as ApiKeyRole) : 'viewer';
}

/** The lower of two roles. */
export function lowerRole(a: ApiKeyRole, b: ApiKeyRole): ApiKeyRole {
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * What a key may do, given what it was issued with and who stands behind it now.
 * `creator` is undefined when the key has no user row behind it, null when the
 * user exists but is not (or no longer) a member of the key's organisation.
 */
export function effectiveKeyRole(
  stored: string | null | undefined,
  creator: string | null | undefined,
): ApiKeyRole {
  if (creator === undefined) return stored ? keyRoleFor(stored) : 'viewer';
  if (creator === null) return 'viewer';
  const now = keyRoleFor(creator);
  return stored ? lowerRole(keyRoleFor(stored), now) : now;
}

/**
 * The creator's role in an organisation, resolved the way /me/orgs/switch
 * resolves it: the primary organisation from users.role, any other from an
 * active organization_members row. undefined: no such user; null: the user is
 * not a member of that organisation.
 */
export async function memberRoleIn(
  userId: string | null | undefined,
  orgId: string,
): Promise<UserRole | null | undefined> {
  if (!userId) return undefined;
  const [user] = await db
    .select({ orgId: users.orgId, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return undefined;
  if (user.orgId === orgId) return user.role as UserRole;
  const [member] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.status, 'active'),
      ),
    )
    .limit(1);
  return member ? (member.role as UserRole) : null;
}
