/**
 * Workflow CRUD service.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  workflows,
  workflowRuns,
  type Workflow,
  type WorkflowNode,
  type WorkflowRun,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { getNodeBreakdown, type WorkflowNodeBreakdown } from './node-stats.js';

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

export interface WorkflowAnalytics {
  totalRuns: number;
  active: number;
  completed: number;
  failed: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  revenuePerRecipient: number;
}

/**
 * Flow analytics: run outcomes + conversion revenue + revenue-per-recipient.
 * Closes the Klaviyo gap where flows exposed only raw run counters.
 */
export async function getWorkflowAnalytics(
  workflowId: string,
  orgId: string,
): Promise<WorkflowAnalytics> {
  await getWorkflow(workflowId, orgId); // authz / existence
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${workflowRuns.status} IN ('pending','running','waiting'))::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${workflowRuns.status} = 'completed')::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${workflowRuns.status} = 'failed')::int`,
      converted: sql<number>`COUNT(*) FILTER (WHERE ${workflowRuns.converted})::int`,
      revenue: sql<string>`COALESCE(SUM(${workflowRuns.conversionValue}), 0)`,
    })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.orgId, orgId)));

  const total = row?.total ?? 0;
  const converted = row?.converted ?? 0;
  const totalRevenue = Number(row?.revenue ?? 0);
  return {
    totalRuns: total,
    active: row?.active ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    converted,
    conversionRate: total > 0 ? converted / total : 0,
    totalRevenue,
    revenuePerRecipient: total > 0 ? totalRevenue / total : 0,
  };
}

/**
 * Per-step breakdown: how many contacts reached each node, what happened to
 * them there, and how many are sitting on it right now.
 *
 * Separate from getWorkflowAnalytics rather than folded into it: that function
 * answers "how is this flow doing" from workflow_runs alone and works for every
 * workflow ever run, while this one reads counters that only exist for runs
 * since the counters did. Merging them would put a number that means "we did
 * not measure" next to numbers that mean "we measured zero".
 */
export async function getWorkflowNodeAnalytics(
  workflowId: string,
  orgId: string,
): Promise<WorkflowNodeBreakdown> {
  // Org scope: this throws notFound for another organisation's id, and it is
  // the only lookup — nothing below runs for a workflow the caller does not own.
  const workflow = await getWorkflow(workflowId, orgId);
  return getNodeBreakdown(
    orgId,
    workflowId,
    workflow.nodes as WorkflowNode[],
    workflow.nodeStatsSince,
  );
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
