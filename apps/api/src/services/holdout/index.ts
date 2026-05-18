/**
 * Holdout groups — randomly hold back a configurable % of contacts from
 * marketing sends so the org can measure incremental lift vs. unmarketed control.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  holdoutGroups, holdoutGroupMembers, contacts,
  type HoldoutGroup,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function createHoldoutGroup(orgId: string, input: {
  name: string; description?: string; percentage: number;
}): Promise<HoldoutGroup> {
  if (input.percentage < 0 || input.percentage > 50) {
    throw AppError.badRequest('Percentage must be 0–50');
  }
  const [row] = await db.insert(holdoutGroups).values({
    orgId, name: input.name, description: input.description ?? null,
    percentage: String(input.percentage),
  }).returning();
  return row!;
}

export async function listHoldoutGroups(orgId: string): Promise<HoldoutGroup[]> {
  return db.select().from(holdoutGroups).where(eq(holdoutGroups.orgId, orgId));
}

/** Random sampling: assign N % of contacts (deterministic via hash mod 100). */
export async function populateHoldout(orgId: string, groupId: string): Promise<{ added: number }> {
  const [grp] = await db.select().from(holdoutGroups)
    .where(and(eq(holdoutGroups.id, groupId), eq(holdoutGroups.orgId, orgId))).limit(1);
  if (!grp) throw AppError.notFound('HoldoutGroup');

  const pct = Number(grp.percentage);
  // Hash-based assignment so re-runs are stable.
  const result = await db.execute<{ inserted: string }>(sql`
    WITH selected AS (
      SELECT id FROM contacts
      WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
        AND (('x' || substr(md5(id::text || ${groupId}), 1, 8))::bit(32)::int % 100) < ${Math.floor(pct)}
    ),
    inserted AS (
      INSERT INTO holdout_group_members (group_id, contact_id)
      SELECT ${groupId}::uuid, id FROM selected
      ON CONFLICT DO NOTHING
      RETURNING contact_id
    )
    SELECT COUNT(*)::text AS inserted FROM inserted
  `);
  const n = (result as unknown as Array<{ inserted: string }>)[0]?.inserted ?? '0';
  return { added: Number(n) };
}

/** True if the contact is in any active holdout group → caller must skip the send. */
export async function isHeldOut(orgId: string, contactId: string): Promise<boolean> {
  const [row] = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM holdout_group_members hgm
    JOIN holdout_groups hg ON hg.id = hgm.group_id
    WHERE hg.org_id = ${orgId}::uuid AND hg.active = true AND hgm.contact_id = ${contactId}::uuid
  `) as unknown as Array<{ n: string }>;
  return Number(row?.n ?? 0) > 0;
}

export async function holdoutMembers(groupId: string, orgId: string, limit = 200): Promise<Array<{ contactId: string; addedAt: Date }>> {
  const [grp] = await db.select().from(holdoutGroups)
    .where(and(eq(holdoutGroups.id, groupId), eq(holdoutGroups.orgId, orgId))).limit(1);
  if (!grp) throw AppError.notFound('HoldoutGroup');
  const rows = await db.select({
    contactId: holdoutGroupMembers.contactId,
    addedAt: holdoutGroupMembers.addedAt,
  }).from(holdoutGroupMembers).where(eq(holdoutGroupMembers.groupId, groupId)).limit(limit);
  return rows;
}

void contacts;
