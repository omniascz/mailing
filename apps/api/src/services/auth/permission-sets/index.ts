/**
 * Custom permission sets service (#345).
 *
 * CRUD on permission_sets + assignments to users. Pure logic (resolution,
 * matching, validation) lives in `./pure.ts`.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import {
  permissionSets, userPermissionSets, type PermissionSet,
} from '../../../db/schema/permission-sets.js';
import { AppError } from '../../../lib/app-error.js';
import { canonicalisePermissions, findInvalidPermission, resolveEffectivePermissions } from './pure.js';
import type { UserRole } from '@forgemsg/shared';

export interface UpsertPermissionSetInput {
  name: string;
  description?: string;
  permissions: string[];
}

export async function createPermissionSet(
  orgId: string,
  input: UpsertPermissionSetInput,
): Promise<PermissionSet> {
  const offender = findInvalidPermission(input.permissions);
  if (offender !== null) {
    throw AppError.badRequest(`Invalid permission string: ${offender}`);
  }
  const canonical = canonicalisePermissions(input.permissions);
  const [row] = await db.insert(permissionSets).values({
    orgId,
    name: input.name,
    description: input.description,
    permissions: canonical,
  }).returning();
  if (!row) throw AppError.internal('Failed to create permission set');
  return row;
}

export async function listPermissionSets(orgId: string): Promise<PermissionSet[]> {
  return db.select().from(permissionSets).where(and(
    eq(permissionSets.orgId, orgId),
    isNull(permissionSets.deletedAt),
  ));
}

export async function updatePermissionSet(
  orgId: string,
  id: string,
  input: Partial<UpsertPermissionSetInput>,
): Promise<PermissionSet> {
  const [existing] = await db.select().from(permissionSets).where(and(
    eq(permissionSets.id, id),
    eq(permissionSets.orgId, orgId),
  )).limit(1);
  if (!existing) throw AppError.notFound('Permission set not found');
  if (existing.isSystem) throw AppError.badRequest('System permission sets cannot be edited');

  const next: Partial<typeof permissionSets.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) next.name = input.name;
  if (input.description !== undefined) next.description = input.description;
  if (input.permissions !== undefined) {
    const offender = findInvalidPermission(input.permissions);
    if (offender !== null) throw AppError.badRequest(`Invalid permission string: ${offender}`);
    next.permissions = canonicalisePermissions(input.permissions);
  }

  const [updated] = await db.update(permissionSets).set(next)
    .where(eq(permissionSets.id, id)).returning();
  if (!updated) throw AppError.internal('Failed to update permission set');
  return updated;
}

export async function deletePermissionSet(orgId: string, id: string): Promise<void> {
  const [existing] = await db.select().from(permissionSets).where(and(
    eq(permissionSets.id, id),
    eq(permissionSets.orgId, orgId),
  )).limit(1);
  if (!existing) throw AppError.notFound('Permission set not found');
  if (existing.isSystem) throw AppError.badRequest('System permission sets cannot be deleted');

  await db.update(permissionSets).set({ deletedAt: new Date() })
    .where(eq(permissionSets.id, id));
}

export async function assignToUser(
  orgId: string,
  userId: string,
  permissionSetId: string,
  grantedByUserId?: string,
): Promise<void> {
  const [set] = await db.select().from(permissionSets).where(and(
    eq(permissionSets.id, permissionSetId),
    eq(permissionSets.orgId, orgId),
  )).limit(1);
  if (!set) throw AppError.notFound('Permission set not found');

  await db.insert(userPermissionSets).values({
    orgId, userId, permissionSetId, grantedByUserId,
  }).onConflictDoNothing();
}

export async function unassignFromUser(
  orgId: string,
  userId: string,
  permissionSetId: string,
): Promise<void> {
  await db.delete(userPermissionSets).where(and(
    eq(userPermissionSets.orgId, orgId),
    eq(userPermissionSets.userId, userId),
    eq(userPermissionSets.permissionSetId, permissionSetId),
  ));
}

/**
 * Compute the effective permission list for a user. Used by route handlers
 * (alongside the `requireRole` middleware) to authorise individual actions.
 */
export async function getEffectivePermissions(
  orgId: string,
  userId: string,
  role: UserRole,
): Promise<string[]> {
  const rows = await db.select({ permissions: permissionSets.permissions })
    .from(userPermissionSets)
    .innerJoin(permissionSets, eq(permissionSets.id, userPermissionSets.permissionSetId))
    .where(and(
      eq(userPermissionSets.orgId, orgId),
      eq(userPermissionSets.userId, userId),
      isNull(permissionSets.deletedAt),
    ));
  return resolveEffectivePermissions(role, rows);
}
