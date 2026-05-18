import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { crmTasks, type CrmTask } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

type TaskInsert = typeof crmTasks.$inferInsert;

export async function createTask(orgId: string, input: {
  type?: 'call' | 'email' | 'meeting' | 'todo';
  status?: 'open' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description?: string;
  contactId?: string | null;
  dealId?: string | null;
  accountId?: string | null;
  assignedUserId?: string | null;
  createdByUserId?: string | null;
  dueAt?: Date | null;
}): Promise<CrmTask> {
  const values: TaskInsert = {
    orgId,
    type: input.type ?? 'todo',
    status: input.status ?? 'open',
    priority: input.priority ?? 'medium',
    title: input.title,
    description: input.description ?? null,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
    accountId: input.accountId ?? null,
    assignedUserId: input.assignedUserId ?? null,
    createdByUserId: input.createdByUserId ?? null,
    dueAt: input.dueAt ?? null,
  };

  const [row] = await db.insert(crmTasks).values(values).returning();
  return row!;
}

export async function getTask(orgId: string, id: string): Promise<CrmTask> {
  const [row] = await db.select().from(crmTasks)
    .where(and(eq(crmTasks.id, id), eq(crmTasks.orgId, orgId), isNull(crmTasks.deletedAt)));
  if (!row) throw AppError.notFound('Task not found');
  return row;
}

export async function listTasks(orgId: string, opts: {
  contactId?: string;
  dealId?: string;
  accountId?: string;
  assignedUserId?: string;
  status?: 'open' | 'completed' | 'cancelled';
  type?: 'call' | 'email' | 'meeting' | 'todo';
  overdue?: boolean;
  limit?: number;
  cursor?: string;
} = {}): Promise<{ data: CrmTask[]; cursor: string | null }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = [eq(crmTasks.orgId, orgId), isNull(crmTasks.deletedAt)];

  if (opts.contactId) conditions.push(eq(crmTasks.contactId, opts.contactId));
  if (opts.dealId) conditions.push(eq(crmTasks.dealId, opts.dealId));
  if (opts.accountId) conditions.push(eq(crmTasks.accountId, opts.accountId));
  if (opts.assignedUserId) conditions.push(eq(crmTasks.assignedUserId, opts.assignedUserId));
  if (opts.status) conditions.push(eq(crmTasks.status, opts.status));
  if (opts.type) conditions.push(eq(crmTasks.type, opts.type));
  if (opts.overdue) {
    conditions.push(sql`${crmTasks.dueAt} < NOW() AND ${crmTasks.status} = 'open'`);
  }
  if (opts.cursor) {
    conditions.push(sql`${crmTasks.createdAt} < (SELECT created_at FROM crm_tasks WHERE id = ${opts.cursor})`);
  }

  const rows = await db.select().from(crmTasks)
    .where(and(...conditions))
    .orderBy(desc(crmTasks.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, cursor: hasMore ? data[data.length - 1]!.id : null };
}

export async function updateTask(orgId: string, id: string, patch: {
  title?: string;
  description?: string | null;
  type?: 'call' | 'email' | 'meeting' | 'todo';
  status?: 'open' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  contactId?: string | null;
  dealId?: string | null;
  accountId?: string | null;
  assignedUserId?: string | null;
  dueAt?: Date | null;
}): Promise<CrmTask> {
  await getTask(orgId, id);

  const update: Partial<TaskInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === 'completed') update.completedAt = new Date();
  }
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.contactId !== undefined) update.contactId = patch.contactId;
  if (patch.dealId !== undefined) update.dealId = patch.dealId;
  if (patch.accountId !== undefined) update.accountId = patch.accountId;
  if (patch.assignedUserId !== undefined) update.assignedUserId = patch.assignedUserId;
  if (patch.dueAt !== undefined) update.dueAt = patch.dueAt;

  const [row] = await db.update(crmTasks)
    .set(update)
    .where(and(eq(crmTasks.id, id), eq(crmTasks.orgId, orgId)))
    .returning();
  return row!;
}

export async function completeTask(orgId: string, id: string): Promise<CrmTask> {
  return updateTask(orgId, id, { status: 'completed' });
}

export async function deleteTask(orgId: string, id: string): Promise<void> {
  await getTask(orgId, id);
  await db.update(crmTasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(crmTasks.id, id), eq(crmTasks.orgId, orgId)));
}

export async function listOverdueTasks(orgId: string): Promise<CrmTask[]> {
  return db.select().from(crmTasks).where(
    and(
      eq(crmTasks.orgId, orgId),
      eq(crmTasks.status, 'open'),
      isNull(crmTasks.deletedAt),
      sql`${crmTasks.dueAt} IS NOT NULL AND ${crmTasks.dueAt} < NOW()`,
    ),
  ).orderBy(asc(crmTasks.dueAt));
}
