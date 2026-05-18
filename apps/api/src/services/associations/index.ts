/**
 * Associations service (#320).
 *
 * Normalises the (fromType,fromId,toType,toId) tuple so lookup from either
 * side returns the same row.
 */

import { and, eq, or } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { associations, type Association, type AssociationEntityType } from '../../db/schema/associations.js';
import { AppError } from '../../lib/app-error.js';

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalisePair(
  aType: AssociationEntityType, aId: string,
  bType: AssociationEntityType, bId: string,
): { fromType: AssociationEntityType; fromId: string; toType: AssociationEntityType; toId: string } {
  const aKey = `${aType}:${aId}`;
  const bKey = `${bType}:${bId}`;
  if (aKey <= bKey) {
    return { fromType: aType, fromId: aId, toType: bType, toId: bId };
  }
  return { fromType: bType, fromId: bId, toType: aType, toId: aId };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createAssociation(orgId: string, input: {
  fromType: AssociationEntityType;
  fromId: string;
  toType: AssociationEntityType;
  toId: string;
  label?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Association> {
  const pair = normalisePair(input.fromType, input.fromId, input.toType, input.toId);
  if (pair.fromType === pair.toType && pair.fromId === pair.toId) {
    throw AppError.badRequest('Cannot associate an entity to itself');
  }

  const [row] = await db.insert(associations).values({
    orgId,
    fromType: pair.fromType,
    fromId: pair.fromId,
    toType: pair.toType,
    toId: pair.toId,
    label: input.label ?? null,
    metadata: input.metadata ?? {},
  })
  .onConflictDoUpdate({
    target: [associations.orgId, associations.fromType, associations.fromId, associations.toType, associations.toId, associations.label],
    set: { metadata: input.metadata ?? {}, updatedAt: new Date() },
  })
  .returning();
  return row!;
}

export async function deleteAssociation(orgId: string, assocId: string): Promise<void> {
  await db.delete(associations)
    .where(and(eq(associations.orgId, orgId), eq(associations.id, assocId)));
}

/** Delete all associations where the given entity is on either side. */
export async function cleanupEntity(
  orgId: string,
  entityType: AssociationEntityType,
  entityId: string,
): Promise<void> {
  await db.delete(associations)
    .where(and(
      eq(associations.orgId, orgId),
      or(
        and(eq(associations.fromType, entityType), eq(associations.fromId, entityId)),
        and(eq(associations.toType, entityType), eq(associations.toId, entityId)),
      )!,
    ));
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/** All entities associated with `(entityType, entityId)`, optionally filtered by peer type. */
export async function listAssociations(
  orgId: string,
  entityType: AssociationEntityType,
  entityId: string,
  peerType?: AssociationEntityType,
): Promise<Array<{
  id: string;
  peerType: AssociationEntityType;
  peerId: string;
  label: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}>> {
  const rows = await db.select().from(associations)
    .where(and(
      eq(associations.orgId, orgId),
      or(
        and(eq(associations.fromType, entityType), eq(associations.fromId, entityId)),
        and(eq(associations.toType, entityType), eq(associations.toId, entityId)),
      )!,
    ));

  const result = rows.map(r => {
    const peerType = (r.fromType === entityType && r.fromId === entityId
      ? r.toType : r.fromType) as AssociationEntityType;
    const peerId = r.fromType === entityType && r.fromId === entityId ? r.toId : r.fromId;
    return {
      id: r.id,
      peerType,
      peerId,
      label: r.label,
      metadata: r.metadata,
      createdAt: r.createdAt,
    };
  });

  return peerType ? result.filter(x => x.peerType === peerType) : result;
}

/** Count associations for a given entity (dashboard widgets). */
export async function countAssociations(
  orgId: string,
  entityType: AssociationEntityType,
  entityId: string,
): Promise<Record<string, number>> {
  const rows = await listAssociations(orgId, entityType, entityId);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.peerType] = (counts[r.peerType] ?? 0) + 1;
  return counts;
}

export { normalisePair };
