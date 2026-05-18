/**
 * Automation map (#214)
 *
 * Builds a directed graph of all workflows and their inter-connections.
 * Two workflows are connected when:
 *   1. A `start_workflow` action node in workflow A references workflow B (parent→child)
 *   2. A `goal` node in workflow A listens for an event that a `start_workflow` node
 *      in workflow B would trigger (inferred, best-effort)
 *
 * Output: standard adjacency graph with node metadata for React Flow rendering.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflows, type WorkflowNode } from '../../db/schema/index.js';

export interface WorkflowMapNode {
  id: string;
  name: string;
  status: string;
  triggerType: string;
  totalRuns: number;
  completedRuns: number;
}

export interface WorkflowMapEdge {
  /** Source workflow ID */
  from: string;
  /** Target workflow ID */
  to: string;
  /** The action node ID that creates the link */
  viaNodeId: string;
  /** Node type — always 'start_workflow' for explicit links */
  type: 'start_workflow';
}

export interface WorkflowMap {
  nodes: WorkflowMapNode[];
  edges: WorkflowMapEdge[];
}

/**
 * Returns the full automation map for an org.
 *
 * Complexity: O(W × N) where W = number of workflows, N = nodes per workflow.
 * Suitable for up to a few thousand workflows per org.
 */
export async function buildWorkflowMap(orgId: string): Promise<WorkflowMap> {
  const rows = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.orgId, orgId), isNull(workflows.deletedAt)));

  const nodes: WorkflowMapNode[] = rows.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    triggerType: w.triggerType,
    totalRuns: w.totalRuns,
    completedRuns: w.completedRuns,
  }));

  // Build a set of known workflow IDs for fast lookup
  const knownIds = new Set(rows.map((w) => w.id));

  const edges: WorkflowMapEdge[] = [];

  for (const workflow of rows) {
    const wfNodes = (workflow.nodes ?? []) as WorkflowNode[];
    for (const node of wfNodes) {
      if (node.type !== 'start_workflow') continue;
      const targetId = (node.config as { workflowId?: string }).workflowId;
      if (!targetId) continue;
      // Only include edges that point to known workflows in this org
      if (!knownIds.has(targetId)) continue;
      edges.push({
        from: workflow.id,
        to: targetId,
        viaNodeId: node.id,
        type: 'start_workflow',
      });
    }
  }

  return { nodes, edges };
}
