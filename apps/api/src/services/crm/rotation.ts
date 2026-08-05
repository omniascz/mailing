/**
 * Record rotation / round-robin service (#326).
 *
 * Assigns new deals / contacts / tickets / leads to users from a configured
 * rotation pool. Supports round-robin, load-balanced, and random strategies.
 *
 * Round-robin state is persisted in `rotation_configs.last_assigned_index`
 * with an atomic DB update to prevent race conditions under concurrent assigns.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  rotationConfigs,
  rotationAssignmentLogs,
  type RotationConfig,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type RotationEntityType = 'deal' | 'contact' | 'ticket' | 'lead';

export async function getRotationConfig(
  orgId: string,
  entityType: RotationEntityType,
  pipelineId?: string,
): Promise<RotationConfig | null> {
  const conditions = [
    eq(rotationConfigs.orgId, orgId),
    eq(rotationConfigs.entityType, entityType),
    eq(rotationConfigs.active, true),
  ];

  if (pipelineId) {
    conditions.push(eq(rotationConfigs.pipelineId, pipelineId));
  }

  const [row] = await db
    .select()
    .from(rotationConfigs)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

/**
 * Assigns the next user from the rotation pool for a given entity.
 * Returns null if no active config or empty pool.
 */
export async function assignNextUser(
  orgId: string,
  entityType: RotationEntityType,
  entityId: string,
  pipelineId?: string,
): Promise<string | null> {
  const config = await getRotationConfig(orgId, entityType, pipelineId);
  if (!config || config.userIds.length === 0) return null;

  const userIds = config.userIds as string[];
  let assignedUserId: string;

  if (config.strategy === 'round_robin') {
    // Atomic increment so concurrent calls don't assign the same user
    const [updated] = await db
      .update(rotationConfigs)
      .set({
        lastAssignedIndex: sql`(${rotationConfigs.lastAssignedIndex} + 1) % ${userIds.length}`,
        updatedAt: new Date(),
      })
      .where(eq(rotationConfigs.id, config.id))
      .returning({ idx: rotationConfigs.lastAssignedIndex });

    const idx = updated?.idx ?? 0;
    assignedUserId = userIds[idx]!;
  } else if (config.strategy === 'random') {
    assignedUserId = userIds[Math.floor(Math.random() * userIds.length)]!;
  } else {
    // load_balanced: pick user with fewest assignments in the last 30 days
    // Simplified: count from rotation_assignment_logs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const counts = await db.execute<{ user_id: string; cnt: string }>(sql`
      SELECT assigned_user_id AS user_id, COUNT(*) AS cnt
      FROM rotation_assignment_logs
      WHERE org_id = ${orgId}::uuid
        AND entity_type = ${entityType}
        AND assigned_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
        AND assigned_user_id = ANY(${sql.param(userIds)}::uuid[])
      GROUP BY assigned_user_id
    `);
    const countMap = new Map<string, number>();
    for (const r of counts as Array<{ user_id: string; cnt: string }>) {
      countMap.set(r.user_id, Number(r.cnt));
    }
    // Pick user with lowest count (default 0 for unassigned users)
    assignedUserId = userIds.reduce((best, uid) =>
      (countMap.get(uid) ?? 0) < (countMap.get(best) ?? 0) ? uid : best,
    );
  }

  // Log the assignment
  await db.insert(rotationAssignmentLogs).values({
    orgId,
    configId: config.id,
    entityType,
    entityId,
    assignedUserId,
  });

  return assignedUserId;
}

// ─── Config CRUD ──────────────────────────────────────────────────────────────

export async function createRotationConfig(
  orgId: string,
  input: {
    name: string;
    entityType: RotationEntityType;
    pipelineId?: string;
    strategy?: 'round_robin' | 'load_balanced' | 'random';
    userIds: string[];
  },
): Promise<RotationConfig> {
  const [row] = await db
    .insert(rotationConfigs)
    .values({
      orgId,
      name: input.name,
      entityType: input.entityType,
      pipelineId: input.pipelineId ?? null,
      strategy: input.strategy ?? 'round_robin',
      userIds: input.userIds,
    })
    .returning();
  return row!;
}

export async function listRotationConfigs(orgId: string): Promise<RotationConfig[]> {
  return db
    .select()
    .from(rotationConfigs)
    .where(and(eq(rotationConfigs.orgId, orgId), eq(rotationConfigs.active, true)));
}

export async function updateRotationConfig(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    userIds: string[];
    strategy: 'round_robin' | 'load_balanced' | 'random';
    active: boolean;
  }>,
): Promise<RotationConfig> {
  const [row] = await db
    .update(rotationConfigs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(rotationConfigs.id, id), eq(rotationConfigs.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('RotationConfig');
  return row;
}
