/**
 * Teams service (#343).
 *
 * Two responsibilities:
 *   1. CRUD for `teams` and `team_members`.
 *   2. Building a row-level filter that routes, services and queries can apply
 *      to any team-partitioned entity (`contacts`, `deals`, `helpdesk_tickets`,
 *      ...). The filter collapses to no-op for admins/owners and users with
 *      `crossTeamAccess = true`. Otherwise we restrict visibility to rows
 *      where `team_id` is in the user's team set — or `team_id IS NULL`
 *      (unowned rows stay visible by default; callers can opt out).
 *
 * Cached in Redis for 60s per (orgId,userId) because team membership is read
 * on almost every request.
 */

import { and, eq, inArray, or, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../../db/client.js';
import { teams, teamMembers, type Team } from '../../db/schema/teams.js';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';
import type { UserRole } from '@forgemsg/shared';

const MEMBERSHIP_TTL = 60; // 60s

export interface TeamContext {
  /** True if the caller bypasses team scoping (owner/admin or cross-team flag). */
  bypass: boolean;
  /** Team IDs the caller can read. Empty + bypass=false → nothing visible. */
  teamIds: string[];
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createTeam(
  orgId: string,
  input: { name: string; slug: string; description?: string },
): Promise<Team> {
  const [row] = await db
    .insert(teams)
    .values({
      orgId,
      name: input.name,
      slug: input.slug,
      description: input.description,
    })
    .returning();
  if (!row) throw AppError.internal('Failed to create team');
  return row;
}

export async function listTeams(orgId: string): Promise<Team[]> {
  return db
    .select()
    .from(teams)
    .where(and(eq(teams.orgId, orgId), isNull(teams.deletedAt)));
}

export async function addMember(
  orgId: string,
  teamId: string,
  userId: string,
  opts?: { teamRole?: string; crossTeamAccess?: boolean },
): Promise<void> {
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.orgId, orgId)))
    .limit(1);
  if (!team) throw AppError.notFound('Team not found');

  await db.insert(teamMembers).values({
    orgId,
    teamId,
    userId,
    teamRole: opts?.teamRole ?? 'member',
    crossTeamAccess: opts?.crossTeamAccess ?? false,
  });
  await redis.del(membershipKey(orgId, userId));
}

export async function removeMember(orgId: string, teamId: string, userId: string): Promise<void> {
  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.orgId, orgId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
      ),
    );
  await redis.del(membershipKey(orgId, userId));
}

// ─── Membership lookup (cached) ──────────────────────────────────────────────

function membershipKey(orgId: string, userId: string): string {
  return `team_membership:${orgId}:${userId}`;
}

export async function getUserTeams(
  orgId: string,
  userId: string,
): Promise<{ teamIds: string[]; crossTeamAccess: boolean }> {
  const key = membershipKey(orgId, userId);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as { teamIds: string[]; crossTeamAccess: boolean };

  const rows = await db
    .select({
      teamId: teamMembers.teamId,
      crossTeamAccess: teamMembers.crossTeamAccess,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.orgId, orgId), eq(teamMembers.userId, userId)));

  const out = {
    teamIds: rows.map((r) => r.teamId),
    crossTeamAccess: rows.some((r) => r.crossTeamAccess),
  };
  await redis.set(key, JSON.stringify(out), 'EX', MEMBERSHIP_TTL);
  return out;
}

// ─── Filter builder ──────────────────────────────────────────────────────────

/**
 * Build the team-visibility context for a request. Owners and admins bypass
 * team scoping; editors/viewers are restricted unless cross-team flagged.
 */
export async function resolveTeamContext(
  orgId: string,
  userId: string,
  role: UserRole,
): Promise<TeamContext> {
  if (role === 'owner' || role === 'admin') {
    return { bypass: true, teamIds: [] };
  }
  const { teamIds, crossTeamAccess } = await getUserTeams(orgId, userId);
  return { bypass: crossTeamAccess, teamIds };
}

/**
 * Returns a Drizzle SQL expression that scopes the given `team_id` column to
 * the caller's visible set. Returns `undefined` for bypass callers.
 *
 * By default, rows with `team_id IS NULL` remain visible (shared / unowned).
 * Pass `includeUnowned: false` to hide NULL-team rows too.
 */
export function teamScopeSql(
  ctx: TeamContext,
  column: PgColumn,
  opts?: { includeUnowned?: boolean },
): SQL | undefined {
  if (ctx.bypass) return undefined;
  if (ctx.teamIds.length === 0) {
    return opts?.includeUnowned === false ? sql`false` : isNull(column);
  }
  const inSet = inArray(column, ctx.teamIds);
  return opts?.includeUnowned === false ? inSet : or(inSet, isNull(column));
}

/**
 * Assert write access for a row about to be created or updated. Throws if the
 * user cannot write to the target `teamId`.
 */
export function assertTeamWrite(ctx: TeamContext, targetTeamId: string | null | undefined): void {
  if (ctx.bypass) return;
  if (targetTeamId == null) return; // org-wide / unowned → everybody can create it
  if (!ctx.teamIds.includes(targetTeamId)) {
    throw AppError.forbidden('You do not have access to this team');
  }
}
