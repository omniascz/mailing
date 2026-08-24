import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, bigint, index, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { workflows } from './workflows.js';

/**
 * Per-step counters for a workflow. One row per (workflow, node), forever.
 *
 * ─── Why counters and not a visit log ────────────────────────────────────────
 *
 * Nothing in the schema remembers where a run has BEEN: `workflow_runs` keeps
 * `current_node_id`, which is overwritten on every hop, and `email_events`
 * carries no run or node reference at all. So the breakdown cannot be derived
 * from what exists — something has to be written as the run passes.
 *
 * The obvious shape, a row per contact per node, costs more than it is worth
 * here. Ten nodes and fifty thousand contacts is five hundred thousand
 * executions per pass: as rows that is roughly 125 MB with indexes, per pass,
 * for one workflow. As counters it is ten rows that never grow, and the write
 * is an UPDATE the same size as the two `workflow_runs` updates the executor
 * already issues per node.
 *
 * What that buys is what it costs: no per-contact drill-down and no time
 * series. Both are answerable from `workflow_runs` for anything still in
 * flight, and neither is what a step report is for — Mailchimp's flow report
 * is a per-step aggregate too.
 *
 * ─── The counters are deliberately not one number ────────────────────────────
 *
 * "Did not continue" is three unrelated things and summing them would be a
 * lie:
 *
 *   waited/resumed  parked on a timer. Still in the flow; may move tomorrow.
 *   endedHere       the flow has no edge onward. Finished by design.
 *   failedHere      an error stopped the run. The only one that is a problem.
 *
 * A condition node adds a fourth non-event: a contact that took the other
 * branch has not dropped out of anything. `branchedTrue`/`branchedFalse`
 * record which way they went; both are also counted in `advanced`.
 */
export const workflowNodeStats = pgTable(
  'workflow_node_stats',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    /** Node id from the workflow's JSONB `nodes` array — not a foreign key. */
    nodeId: varchar('node_id', { length: 255 }).notNull(),

    /** Executions that began at this node. */
    entered: bigint('entered', { mode: 'number' }).notNull().default(0),
    /** …of which moved on to another node, by any edge. */
    advanced: bigint('advanced', { mode: 'number' }).notNull().default(0),
    /** Subsets of `advanced` for condition nodes. */
    branchedTrue: bigint('branched_true', { mode: 'number' }).notNull().default(0),
    branchedFalse: bigint('branched_false', { mode: 'number' }).notNull().default(0),
    /** Parked here on a timer. */
    waited: bigint('waited', { mode: 'number' }).notNull().default(0),
    /** Came back off that timer. `waited - resumed` is still parked or cancelled. */
    resumed: bigint('resumed', { mode: 'number' }).notNull().default(0),
    /** The run completed at this node — no edge leads onward. */
    endedHere: bigint('ended_here', { mode: 'number' }).notNull().default(0),
    /** The run failed at this node. */
    failedHere: bigint('failed_here', { mode: 'number' }).notNull().default(0),

    /**
     * When this node was first recorded.
     *
     * Load-bearing, not decoration: runs that started before this timestamp
     * were never counted, and the report has to say "no data" for them rather
     * than show a zero that reads as "nobody came through".
     */
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workflowId, t.nodeId] }),
    index('workflow_node_stats_org_idx').on(t.orgId, t.workflowId),
  ],
);

export type WorkflowNodeStat = typeof workflowNodeStats.$inferSelect;
export type NewWorkflowNodeStat = typeof workflowNodeStats.$inferInsert;

/** The counter names a node execution can bump. */
export type NodeStatCounter =
  | 'entered'
  | 'advanced'
  | 'branchedTrue'
  | 'branchedFalse'
  | 'waited'
  | 'resumed'
  | 'endedHere'
  | 'failedHere';

export const NODE_STAT_COUNTERS = [
  'entered',
  'advanced',
  'branchedTrue',
  'branchedFalse',
  'waited',
  'resumed',
  'endedHere',
  'failedHere',
] as const satisfies readonly NodeStatCounter[];

/** Kept next to the table so a new counter cannot be added without a column. */
export const NODE_STAT_COLUMN = {
  entered: sql`entered`,
  advanced: sql`advanced`,
  branchedTrue: sql`branched_true`,
  branchedFalse: sql`branched_false`,
  waited: sql`waited`,
  resumed: sql`resumed`,
  endedHere: sql`ended_here`,
  failedHere: sql`failed_here`,
} as const;
