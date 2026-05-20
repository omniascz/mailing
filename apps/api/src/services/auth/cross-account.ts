/**
 * Cross-account user access service (#274).
 *
 * - getUserOrgs: list all orgs a user has access to (primary + memberships)
 * - switchOrg: issue a new session token for a different org
 * - inviteMember / acceptInvitation / removeMember
 */

import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/organizations.js';
import { users } from '../../db/schema/users.js';
import {
  organizationMembers,
  type OrganizationMember,
} from '../../db/schema/organization-members.js';
import { createSession } from './sessions.js';
import { AppError } from '../../lib/app-error.js';
import type { UserRole } from '@forgemsg/shared';

// ─── List user's orgs ─────────────────────────────────────────────────────────

export interface OrgAccess {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
  isPrimary: boolean;
}

export async function getUserOrgs(userId: string): Promise<OrgAccess[]> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw AppError.notFound('User');

  // Primary org (from users.org_id)
  const [primaryOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.orgId))
    .limit(1);

  const result: OrgAccess[] = [];
  if (primaryOrg) {
    result.push({
      orgId: primaryOrg.id,
      orgName: primaryOrg.name,
      orgSlug: primaryOrg.slug,
      role: user.role,
      isPrimary: true,
    });
  }

  // Additional memberships
  const memberships = await db
    .select({
      orgId: organizationMembers.orgId,
      role: organizationMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, 'active')));

  for (const m of memberships) {
    if (m.orgId === user.orgId) continue; // skip primary if also in members table
    result.push({
      orgId: m.orgId,
      orgName: m.orgName,
      orgSlug: m.orgSlug,
      role: m.role,
      isPrimary: false,
    });
  }

  return result;
}

// ─── Switch org (issue new session) ──────────────────────────────────────────

export async function switchOrg(userId: string, targetOrgId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw AppError.notFound('User');

  let role: string = user.role;

  if (user.orgId === targetOrgId) {
    // Primary org — already have access
  } else {
    // Check membership
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.orgId, targetOrgId),
          eq(organizationMembers.status, 'active'),
        ),
      )
      .limit(1);
    if (!member) throw AppError.forbidden('No access to this organisation');
    role = member.role;
  }

  const token = await createSession({
    userId,
    orgId: targetOrgId,
    email: user.email,
    role: role as UserRole,
  });

  return token;
}

// ─── Invite member ────────────────────────────────────────────────────────────

export async function inviteMember(
  orgId: string,
  invitedByUserId: string,
  email: string,
  role: string,
): Promise<{ memberId: string; token: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Find user account if exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const [member] = await db
    .insert(organizationMembers)
    .values({
      orgId,
      userId: existingUser?.id ?? null,
      email,
      role,
      status: 'pending',
      invitedByUserId,
      invitationToken: token,
      invitationExpiresAt: expiresAt,
    })
    .onConflictDoUpdate({
      target: [organizationMembers.orgId, organizationMembers.email],
      set: {
        role,
        status: 'pending',
        invitationToken: token,
        invitationExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { memberId: member!.id, token };
}

// ─── Accept invitation ────────────────────────────────────────────────────────

export async function acceptInvitation(token: string, userId: string): Promise<OrganizationMember> {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.invitationToken, token))
    .limit(1);

  if (!member) throw AppError.notFound('Invitation');
  if (member.status !== 'pending') throw AppError.badRequest('Invitation already used');
  if (member.invitationExpiresAt && member.invitationExpiresAt < new Date()) {
    throw AppError.badRequest('Invitation expired');
  }

  const [updated] = await db
    .update(organizationMembers)
    .set({
      userId,
      status: 'active',
      invitationToken: null,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.id, member.id))
    .returning();

  return updated!;
}

// ─── Update member role ───────────────────────────────────────────────────────

export async function updateMemberRole(
  orgId: string,
  memberId: string,
  role: string,
): Promise<void> {
  const [row] = await db
    .update(organizationMembers)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.orgId, orgId)))
    .returning({ id: organizationMembers.id });
  if (!row) throw AppError.notFound('Member');
}

// ─── Remove member ────────────────────────────────────────────────────────────

export async function removeMember(orgId: string, memberId: string): Promise<void> {
  const [row] = await db
    .update(organizationMembers)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.orgId, orgId)))
    .returning({ id: organizationMembers.id });
  if (!row) throw AppError.notFound('Member');
}

// Re-export type for convenience
export type { OrganizationMember } from '../../db/schema/organization-members.js';
