/**
 * Recording and reading the per-step counters.
 *
 * The write is one upsert per node execution, deliberately fire-and-forget:
 * reporting must never be the reason a contact's automation stops. If the
 * counter write fails the run carries on and the step report is short by one —
 * the opposite trade would let a analytics table take down the flow engine.
 */

import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  workflowNodeStats,
  workflowRuns,
  type NodeStatCounter,
  type WorkflowNode,
} from '../../db/schema/index.js';

/** Column name per counter — the SET clause is built from this, not from input. */
const COLUMN: Record<NodeStatCounter, string> = {
  entered: 'entered',
  advanced: 'advanced',
  branchedTrue: 'branched_true',
  branchedFalse: 'branched_false',
  waited: 'waited',
  resumed: 'resumed',
  endedHere: 'ended_here',
  failedHere: 'failed_here',
};

export interface NodeStatKey {
  orgId: string;
  workflowId: string;
  nodeId: string;
}

/**
 * Add one to each named counter for a node, creating the row if this is the
 * first time anyone reached it.
 *
 * `nodeId` comes from the workflow's own JSONB, never from a request, and the
 * counter names are keys of a fixed record — the SQL below interpolates only
 * values and a column name looked up in COLUMN, never caller text.
 */
export async function bumpNodeStats(
  key: NodeStatKey,
  counters: readonly NodeStatCounter[],
): Promise<void> {
  if (counters.length === 0) return;

  const unique = [...new Set(counters)];
  const columns = unique.map((c) => COLUMN[c]);

  // Written as one statement rather than through the query builder because the
  // SET clause has to read the existing row (`col = table.col + 1`), which the
  // builder's `set` object cannot express per-column at runtime. Column names
  // come from COLUMN — a fixed record keyed by a union type — so nothing here
  // is caller text; the three values are bound parameters.
  const columnList = sql.raw(columns.join(', '));
  const oneEach = sql.raw(columns.map(() => '1').join(', '));
  const increments = sql.raw(
    columns.map((col) => `${col} = workflow_node_stats.${col} + 1`).join(', '),
  );

  try {
    await db.execute(sql`
      INSERT INTO workflow_node_stats (org_id, workflow_id, node_id, ${columnList})
      VALUES (${key.orgId}::uuid, ${key.workflowId}::uuid, ${key.nodeId}, ${oneEach})
      ON CONFLICT (workflow_id, node_id) DO UPDATE
        SET ${increments}, last_seen_at = now()
    `);
  } catch (err) {
    // Reporting is not allowed to break a run. Logged, not rethrown.
    console.warn(
      `[workflow-node-stats] ${key.workflowId}/${key.nodeId} not recorded: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface NodeBreakdownRow {
  nodeId: string;
  type: string;
  /**
   * False when this node has no counter row: nobody has been through it, or
   * everybody who did came through before the counters existed. Either way the
   * numbers below are unknown rather than zero, and the UI must say so.
   */
  recorded: boolean;
  entered: number;
  advanced: number;
  branchedTrue: number;
  branchedFalse: number;
  waited: number;
  resumed: number;
  endedHere: number;
  failedHere: number;
  /** Runs sitting on this node right now, counted live from workflow_runs. */
  currentlyHere: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface WorkflowNodeBreakdown {
  /** True once any node of this workflow has a counter row. */
  hasData: boolean;
  /**
   * Runs that started before the first counter was written. They are missing
   * from every number in `nodes`, so the report has to admit to them rather
   * than fold them into a zero.
   */
  runsPredatingTracking: number;
  trackingSince: string | null;
  nodes: NodeBreakdownRow[];
}

/**
 * The per-step breakdown for one workflow.
 *
 * Both queries are org-scoped. The caller has already checked the workflow
 * belongs to the org, and these check again — this repository has no
 * row-level security, so a missed `eq(orgId)` is the whole boundary.
 */
export async function getNodeBreakdown(
  orgId: string,
  workflowId: string,
  nodes: WorkflowNode[],
  /** `workflows.node_stats_since` — the exact moment tracking began. */
  trackingSince: Date | null,
): Promise<WorkflowNodeBreakdown> {
  const stats = await db
    .select()
    .from(workflowNodeStats)
    .where(and(eq(workflowNodeStats.orgId, orgId), eq(workflowNodeStats.workflowId, workflowId)))
    .orderBy(asc(workflowNodeStats.firstSeenAt));

  const live = await db
    .select({
      nodeId: workflowRuns.currentNodeId,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.orgId, orgId),
        eq(workflowRuns.workflowId, workflowId),
        sql`${workflowRuns.status} IN ('pending','running','waiting')`,
        sql`${workflowRuns.currentNodeId} IS NOT NULL`,
      ),
    )
    .groupBy(workflowRuns.currentNodeId);

  const byNode = new Map(stats.map((s) => [s.nodeId, s]));
  const hereByNode = new Map(live.filter((l) => l.nodeId).map((l) => [l.nodeId as string, l.n]));

  // Runs that predate the counters. With no marker at all, that is every run
  // there has ever been — which is exactly the "we do not know" case.
  const [predating] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.orgId, orgId),
        eq(workflowRuns.workflowId, workflowId),
        // `lt` rather than a hand-written comparison: a Date interpolated into
        // raw sql reaches the driver unserialised and the query dies.
        trackingSince ? lt(workflowRuns.createdAt, trackingSince) : sql`true`,
      ),
    );

  return {
    hasData: trackingSince !== null,
    runsPredatingTracking: predating?.n ?? 0,
    trackingSince: trackingSince ? trackingSince.toISOString() : null,
    nodes: nodes.map((node) => {
      const s = byNode.get(node.id);
      return {
        nodeId: node.id,
        type: node.type,
        recorded: Boolean(s),
        entered: s?.entered ?? 0,
        advanced: s?.advanced ?? 0,
        branchedTrue: s?.branchedTrue ?? 0,
        branchedFalse: s?.branchedFalse ?? 0,
        waited: s?.waited ?? 0,
        resumed: s?.resumed ?? 0,
        endedHere: s?.endedHere ?? 0,
        failedHere: s?.failedHere ?? 0,
        currentlyHere: hereByNode.get(node.id) ?? 0,
        firstSeenAt: s?.firstSeenAt ? s.firstSeenAt.toISOString() : null,
        lastSeenAt: s?.lastSeenAt ? s.lastSeenAt.toISOString() : null,
      };
    }),
  };
}
