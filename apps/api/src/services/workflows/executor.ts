/**
 * Workflow execution engine (task 5.2).
 *
 * Core loop:
 *   startWorkflowRun(workflowId, contactId) → creates WorkflowRun, executes first node
 *   resumeWorkflowRun(runId)               → called by BullMQ scheduler or on event
 *   processWorkflowRuns()                  → picks up all pending/waiting runs due now
 *
 * State machine per run:
 *   pending → running → waiting | completed | failed | cancelled
 *   waiting → running (when next_execution_at <= now)
 */

import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  contactTags,
  tags,
  contactLists,
  workflows,
  workflowRuns,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowRun,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { executeAction, type ActionContext, type ContactData } from './actions.js';

// ─── Contact loader ───────────────────────────────────────────────────────────

async function loadContact(contactId: string, orgId: string): Promise<ContactData | null> {
  const [contact] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);

  if (!contact) return null;

  // Load tags
  const tagRows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, contactId));

  // Load lists
  const listRows = await db
    .select({ listId: contactLists.listId })
    .from(contactLists)
    .where(eq(contactLists.contactId, contactId));

  return {
    id: contact.id,
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    customFields: (contact.customFields as Record<string, unknown>) ?? {},
    tags: tagRows.map((t) => t.name),
    listIds: listRows.map((l) => l.listId),
  };
}

// ─── Edge resolution ──────────────────────────────────────────────────────────

/**
 * Find the next node ID given a completed node and optionally a branch label.
 * For condition nodes: label = 'true' | 'false'.
 * For all other nodes: pick the first edge from this source (label ignored).
 */
function resolveNextNode(
  completedNodeId: string,
  edges: WorkflowEdge[],
  branch?: 'true' | 'false',
): string | null {
  const outEdges = edges.filter((e) => e.source === completedNodeId);
  if (outEdges.length === 0) return null;

  if (branch) {
    const branchEdge = outEdges.find((e) => e.label === branch);
    return branchEdge?.target ?? null;
  }

  return outEdges[0]!.target;
}

// ─── Run a single node ────────────────────────────────────────────────────────

async function executeNode(
  run: WorkflowRun,
  node: WorkflowNode,
  workflow: typeof workflows.$inferSelect,
): Promise<void> {
  const ctx: ActionContext = {
    orgId: run.orgId,
    contact: run.contactId ? await loadContact(run.contactId, run.orgId) : null,
  };

  // Mark run as running + set current node
  await db
    .update(workflowRuns)
    .set({ status: 'running', currentNodeId: node.id, startedAt: run.startedAt ?? new Date() })
    .where(eq(workflowRuns.id, run.id));

  const result = await executeAction(node, run, ctx);

  switch (result.type) {
    case 'next': {
      const nextNodeId = result.nextNodeId ?? resolveNextNode(node.id, workflow.edges as WorkflowEdge[]);
      if (!nextNodeId) {
        // Terminal — no more edges
        await completeRun(run.id, workflow.id);
        return;
      }
      const nextNode = (workflow.nodes as WorkflowNode[]).find((n) => n.id === nextNodeId);
      if (!nextNode) {
        await failRun(run.id, workflow.id, `Node ${nextNodeId} not found in workflow`);
        return;
      }
      // Execute immediately (synchronous chain)
      const updatedRun: WorkflowRun = { ...run, currentNodeId: node.id };
      await executeNode(updatedRun, nextNode, workflow);
      break;
    }
    case 'branch': {
      const nextNodeId = resolveNextNode(node.id, workflow.edges as WorkflowEdge[], result.branch);
      if (!nextNodeId) {
        await completeRun(run.id, workflow.id);
        return;
      }
      const nextNode = (workflow.nodes as WorkflowNode[]).find((n) => n.id === nextNodeId);
      if (!nextNode) {
        await failRun(run.id, workflow.id, `Branch node ${nextNodeId} not found`);
        return;
      }
      const updatedRun: WorkflowRun = { ...run, currentNodeId: node.id };
      await executeNode(updatedRun, nextNode, workflow);
      break;
    }
    case 'wait': {
      await db
        .update(workflowRuns)
        .set({ status: 'waiting', currentNodeId: node.id, nextExecutionAt: result.until })
        .where(eq(workflowRuns.id, run.id));
      break;
    }
    case 'complete': {
      await completeRun(run.id, workflow.id);
      break;
    }
    case 'error': {
      await failRun(run.id, workflow.id, result.message);
      break;
    }
  }
}

async function completeRun(runId: string, workflowId: string): Promise<void> {
  await db
    .update(workflowRuns)
    .set({ status: 'completed', completedAt: new Date(), nextExecutionAt: null })
    .where(eq(workflowRuns.id, runId));

  await db
    .update(workflows)
    .set({ completedRuns: sql`${workflows.completedRuns} + 1` })
    .where(eq(workflows.id, workflowId));
}

async function failRun(runId: string, workflowId: string, message: string): Promise<void> {
  await db
    .update(workflowRuns)
    .set({ status: 'failed', errorMessage: message.slice(0, 2048), completedAt: new Date() })
    .where(eq(workflowRuns.id, runId));

  await db
    .update(workflows)
    .set({ failedRuns: sql`${workflows.failedRuns} + 1` })
    .where(eq(workflows.id, workflowId));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a new workflow run for a contact.
 * Finds the trigger node and begins execution from the first action node.
 */
export async function startWorkflowRun(
  workflowId: string,
  orgId: string,
  contactId: string,
  initialData: Record<string, unknown> = {},
): Promise<WorkflowRun> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.orgId, orgId), eq(workflows.status, 'active')),
    )
    .limit(1);

  if (!workflow) throw AppError.notFound('Workflow');

  const nodes = workflow.nodes as WorkflowNode[];
  const triggerNode = nodes.find((n) => n.type === 'trigger');
  if (!triggerNode) throw AppError.badRequest('Workflow has no trigger node');

  // Create run
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      orgId,
      contactId,
      status: 'pending',
      data: initialData,
      startedAt: new Date(),
    })
    .returning();

  if (!run) throw AppError.internal('Failed to create workflow run');

  // Increment total_runs
  await db
    .update(workflows)
    .set({ totalRuns: sql`${workflows.totalRuns} + 1` })
    .where(eq(workflows.id, workflowId));

  // Find the first action node after the trigger
  const firstEdge = (workflow.edges as WorkflowEdge[]).find((e) => e.source === triggerNode.id);
  if (!firstEdge) {
    // Workflow has only a trigger, nothing to do
    await completeRun(run.id, workflowId);
    return { ...run, status: 'completed' };
  }

  const firstNode = nodes.find((n) => n.id === firstEdge.target);
  if (!firstNode) {
    await failRun(run.id, workflowId, `First action node ${firstEdge.target} not found`);
    return { ...run, status: 'failed' };
  }

  // Execute — may be sync (action chains) or async (wait nodes)
  await executeNode(run, firstNode, workflow).catch(async (err: Error) => {
    await failRun(run.id, workflowId, err.message);
  });

  // Return fresh state
  const [updated] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, run.id))
    .limit(1);

  return updated ?? run;
}

/**
 * Resume a waiting run (called by the BullMQ scheduler).
 */
export async function resumeWorkflowRun(runId: string): Promise<void> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, 'waiting')))
    .limit(1);

  if (!run) return; // already completed or not found

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, run.workflowId))
    .limit(1);

  if (!workflow) {
    await failRun(run.id, run.workflowId, 'Workflow not found during resume');
    return;
  }

  if (!run.currentNodeId) {
    await failRun(run.id, run.workflowId, 'No current node to resume from');
    return;
  }

  // Find the next node after the wait node
  const nextNodeId = resolveNextNode(run.currentNodeId, workflow.edges as WorkflowEdge[]);
  if (!nextNodeId) {
    await completeRun(run.id, workflow.id);
    return;
  }

  const nextNode = (workflow.nodes as WorkflowNode[]).find((n) => n.id === nextNodeId);
  if (!nextNode) {
    await failRun(run.id, workflow.id, `Resume node ${nextNodeId} not found`);
    return;
  }

  await executeNode(run, nextNode, workflow).catch(async (err: Error) => {
    await failRun(run.id, workflow.id, err.message);
  });
}

/**
 * Process all workflow runs that are due for execution.
 * Called by a BullMQ cron job every minute.
 */
export async function processWorkflowRuns(): Promise<{ processed: number; errors: number }> {
  const now = new Date();

  const dueRuns = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.status, 'waiting'),
        lte(workflowRuns.nextExecutionAt, now),
      ),
    )
    .limit(500); // max 500 per tick to avoid overload

  let processed = 0;
  let errors = 0;

  await Promise.allSettled(
    dueRuns.map(async (run) => {
      try {
        await resumeWorkflowRun(run.id);
        processed++;
      } catch {
        errors++;
      }
    }),
  );

  return { processed, errors };
}
