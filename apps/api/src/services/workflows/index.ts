/**
 * Workflow CRUD service.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflows, workflowRuns, type Workflow, type WorkflowRun } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateWorkflowInput {
  orgId: string;
  name: string;
  description?: string;
  triggerType?: Workflow['triggerType'];
  triggerConfig?: Record<string, unknown>;
  nodes?: unknown[];
  edges?: unknown[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  status?: Workflow['status'];
  triggerType?: Workflow['triggerType'];
  triggerConfig?: Record<string, unknown>;
  nodes?: unknown[];
  edges?: unknown[];
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  const [row] = await db
    .insert(workflows)
    .values({
      orgId: input.orgId,
      name: input.name,
      description: input.description,
      triggerType: input.triggerType ?? 'manual',
      triggerConfig: input.triggerConfig ?? {},
      nodes: (input.nodes ?? []) as Workflow['nodes'],
      edges: (input.edges ?? []) as Workflow['edges'],
    })
    .returning();

  if (!row) throw AppError.internal('Failed to create workflow');
  return row;
}

export async function getWorkflow(id: string, orgId: string): Promise<Workflow> {
  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId), isNull(workflows.deletedAt)))
    .limit(1);

  if (!row) throw AppError.notFound('Workflow');
  return row;
}

export async function listWorkflows(
  orgId: string,
  opts: { status?: Workflow['status']; cursor?: string; limit?: number } = {},
): Promise<{ data: Workflow[]; hasMore: boolean; cursor?: string }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const rows = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        isNull(workflows.deletedAt),
        opts.status ? eq(workflows.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(workflows.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, hasMore, cursor: hasMore ? data[data.length - 1]!.id : undefined };
}

export async function updateWorkflow(
  id: string,
  orgId: string,
  input: UpdateWorkflowInput,
): Promise<Workflow> {
  const update: Partial<typeof workflows.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.status !== undefined) update.status = input.status;
  if (input.triggerType !== undefined) update.triggerType = input.triggerType;
  if (input.triggerConfig !== undefined) update.triggerConfig = input.triggerConfig;
  if (input.nodes !== undefined) update.nodes = input.nodes as Workflow['nodes'];
  if (input.edges !== undefined) update.edges = input.edges as Workflow['edges'];

  const [row] = await db
    .update(workflows)
    .set(update)
    .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId), isNull(workflows.deletedAt)))
    .returning();

  if (!row) throw AppError.notFound('Workflow');
  return row;
}

export async function deleteWorkflow(id: string, orgId: string): Promise<void> {
  const [row] = await db
    .update(workflows)
    .set({ deletedAt: new Date(), status: 'archived' })
    .where(and(eq(workflows.id, id), eq(workflows.orgId, orgId), isNull(workflows.deletedAt)))
    .returning({ id: workflows.id });

  if (!row) throw AppError.notFound('Workflow');
}

export async function activateWorkflow(id: string, orgId: string): Promise<Workflow> {
  return updateWorkflow(id, orgId, { status: 'active' });
}

export async function deactivateWorkflow(id: string, orgId: string): Promise<Workflow> {
  return updateWorkflow(id, orgId, { status: 'inactive' });
}

// ─── Run history ──────────────────────────────────────────────────────────────

export async function listWorkflowRuns(
  workflowId: string,
  orgId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ data: WorkflowRun[]; hasMore: boolean; cursor?: string }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const rows = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.orgId, orgId)))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, hasMore, cursor: hasMore ? data[data.length - 1]!.id : undefined };
}

export async function getWorkflowRun(runId: string, orgId: string): Promise<WorkflowRun> {
  const [row] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('Workflow run');
  return row;
}

export async function cancelWorkflowRun(runId: string, orgId: string): Promise<WorkflowRun> {
  const [row] = await db
    .update(workflowRuns)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.orgId, orgId),
        sql`status IN ('pending', 'running', 'waiting')`,
      ),
    )
    .returning();

  if (!row) throw AppError.notFound('Workflow run');
  return row;
}
