/**
 * Saved NL queries (#272/L4-4).
 *
 * CRUD + run helpers for user-pinned analytics questions. A saved query
 * stores the question text; on each run we re-invoke NL→SQL (cached) so
 * the latest schema is always used.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { savedQueries, type SavedQuery } from '../../db/schema/saved-queries.js';
import { AppError } from '../../lib/app-error.js';

export interface CreateSavedQueryInput {
  name: string;
  description?: string;
  question: string;
  visibility?: 'org' | 'private';
  tags?: string[];
}

export async function createSavedQuery(
  orgId: string,
  ownerUserId: string,
  input: CreateSavedQueryInput,
): Promise<SavedQuery> {
  const [row] = await db
    .insert(savedQueries)
    .values({
      orgId,
      ownerUserId,
      name: input.name,
      description: input.description,
      question: input.question,
      visibility: input.visibility ?? 'org',
      tags: input.tags ?? [],
    })
    .returning();
  return row!;
}

export async function listSavedQueries(orgId: string, userId: string): Promise<SavedQuery[]> {
  const rows = await db
    .select()
    .from(savedQueries)
    .where(and(eq(savedQueries.orgId, orgId), isNull(savedQueries.deletedAt)))
    .orderBy(desc(savedQueries.lastRunAt));
  return rows.filter((r) => r.visibility === 'org' || r.ownerUserId === userId);
}

export async function getSavedQuery(
  orgId: string,
  id: string,
  userId: string,
): Promise<SavedQuery> {
  const [row] = await db
    .select()
    .from(savedQueries)
    .where(
      and(eq(savedQueries.orgId, orgId), eq(savedQueries.id, id), isNull(savedQueries.deletedAt)),
    )
    .limit(1);
  if (!row) throw AppError.notFound('Saved query');
  if (row.visibility === 'private' && row.ownerUserId !== userId) {
    throw AppError.forbidden('This saved query belongs to another user');
  }
  return row;
}

export async function updateSavedQuery(
  orgId: string,
  id: string,
  userId: string,
  patch: Partial<CreateSavedQueryInput>,
): Promise<SavedQuery> {
  // Only the owner can edit; visibility='org' doesn't grant edit rights
  const existing = await getSavedQuery(orgId, id, userId);
  if (existing.ownerUserId !== userId) {
    throw AppError.forbidden('Only the owner can edit a saved query');
  }
  const [row] = await db
    .update(savedQueries)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(savedQueries.id, id))
    .returning();
  return row!;
}

export async function deleteSavedQuery(orgId: string, id: string, userId: string): Promise<void> {
  const existing = await getSavedQuery(orgId, id, userId);
  if (existing.ownerUserId !== userId) {
    throw AppError.forbidden('Only the owner can delete a saved query');
  }
  await db
    .update(savedQueries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(savedQueries.id, id));
}

/**
 * Record a successful run of a saved query. Increments runCount and stamps
 * the last SQL + chart type for fast re-open in the UI.
 */
export async function recordRun(
  id: string,
  opts: { sql: string; chartType?: string; durationMs: number },
): Promise<void> {
  await db
    .update(savedQueries)
    .set({
      lastSql: opts.sql,
      ...(opts.chartType ? { lastChartType: opts.chartType } : {}),
      lastRunDurationMs: opts.durationMs,
      lastRunAt: new Date(),
      runCount: sql`${savedQueries.runCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(savedQueries.id, id));
}
