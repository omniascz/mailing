import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function logAuditEvent(params: {
  orgId: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const [row] = await db
    .insert(auditLogs)
    .values({
      orgId: params.orgId,
      userId: params.userId ?? null,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId ?? null,
      changes: params.changes ?? undefined,
      metadata: params.metadata ?? undefined,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    })
    .returning();
  return row!;
}

export async function listAuditLogs(
  orgId: string,
  opts: {
    userId?: string;
    resource?: string;
    action?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    cursor?: string;
  },
) {
  const { userId, resource, action, from, to, limit = 50, cursor } = opts;

  const conditions = [eq(auditLogs.orgId, orgId)];
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (resource) conditions.push(eq(auditLogs.resource, resource));
  if (action) conditions.push(eq(auditLogs.action, action));
  if (from) conditions.push(gte(auditLogs.createdAt, from));
  if (to) conditions.push(lte(auditLogs.createdAt, to));
  if (cursor) conditions.push(lte(auditLogs.createdAt, new Date(cursor)));

  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.createdAt.toISOString() : null;

  return { data, hasMore, cursor: nextCursor };
}

export async function getAuditLog(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.id, id), eq(auditLogs.orgId, orgId)));
  if (!row) throw AppError.notFound('Audit log not found');
  return row;
}
