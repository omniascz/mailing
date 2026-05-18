import { sql, and, eq, isNull, asc, gt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { segments, contacts, type SegmentConditions } from '../../db/schema/index.js';
import { buildSegmentWhere, SegmentQueryError } from './query-builder.js';
import { AppError } from '../../lib/app-error.js';

export { SegmentQueryError };

export interface CreateSegmentInput {
  orgId: string;
  name: string;
  description?: string;
  conditions: SegmentConditions;
}

export async function createSegment(input: CreateSegmentInput) {
  // Validate conditions parse before persisting.
  buildSegmentWhere(input.conditions);
  const [row] = await db
    .insert(segments)
    .values({
      orgId: input.orgId,
      name: input.name,
      description: input.description,
      conditions: input.conditions,
    })
    .returning();
  return row;
}

export async function updateSegment(
  orgId: string,
  id: string,
  patch: { name?: string; description?: string; conditions?: SegmentConditions },
) {
  if (patch.conditions) buildSegmentWhere(patch.conditions);
  const [row] = await db
    .update(segments)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(segments.id, id), eq(segments.orgId, orgId), isNull(segments.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Segment');
  return row;
}

export async function deleteSegment(orgId: string, id: string) {
  const [row] = await db
    .update(segments)
    .set({ deletedAt: new Date() })
    .where(and(eq(segments.id, id), eq(segments.orgId, orgId), isNull(segments.deletedAt)))
    .returning();
  if (!row) throw AppError.notFound('Segment');
}

export async function listSegments(orgId: string) {
  return db
    .select()
    .from(segments)
    .where(and(eq(segments.orgId, orgId), isNull(segments.deletedAt)))
    .orderBy(asc(segments.name));
}

export async function getSegment(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(segments)
    .where(and(eq(segments.id, id), eq(segments.orgId, orgId), isNull(segments.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('Segment');
  return row;
}

/**
 * Count matching contacts for a given conditions tree, org-scoped.
 * Accepts either a stored segment id or an ad-hoc conditions object via the caller.
 */
export async function countByConditions(orgId: string, conditions: SegmentConditions): Promise<number> {
  const where = buildSegmentWhere(conditions);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        isNull(contacts.deletedAt),
        where,
      ),
    );
  return result[0]?.count ?? 0;
}

/**
 * Return contacts matching the segment with cursor pagination.
 */
export async function listContactsByConditions(
  orgId: string,
  conditions: SegmentConditions,
  opts: { cursor?: string; limit?: number } = {},
) {
  const where = buildSegmentWhere(conditions);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);

  const whereClauses = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt), where];
  if (opts.cursor) whereClauses.push(gt(contacts.id, opts.cursor));

  const rows = await db
    .select()
    .from(contacts)
    .where(and(...whereClauses))
    .orderBy(asc(contacts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;
  return { data, cursor: nextCursor, hasMore };
}
