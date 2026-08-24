import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  boolean,
  integer,
  numeric,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const workflowStatusEnum = pgEnum('workflow_status', [
  'draft',
  'active',
  'inactive',
  'archived',
]);

export const workflowRunStatusEnum = pgEnum('workflow_run_status', [
  'pending',
  'running',
  'waiting', // waiting on a WaitNode timer
  'completed',
  'failed',
  'cancelled',
]);

export const workflowTriggerTypeEnum = pgEnum('workflow_trigger_type', [
  'list_subscribe',
  'tag_added',
  'date_field',
  'api_event',
  'form_submit',
  'purchase_event',
  'manual',
  'loyalty_points_earned', // #239 — member earned points
  'loyalty_tier_up', // #239 — member reached a new tier
  'loyalty_reward_redeemed', // #239 — member redeemed a reward
  'name_day_today', // #360/#384 — contact first_name matches today's jmeniny
  'lifecycle_stage_changed', // #317/#394 — contact lifecycle stage transitioned
  'n_days_before_holiday', // #389 — N days before a CZ/SK public holiday
  'segment_entered', // contact newly matched a segment (Klaviyo "added to segment")
  'segment_exited', // contact stopped matching a segment
]);

// ─── Workflows ────────────────────────────────────────────────────────────────

/**
 * A workflow definition: nodes + edges stored as JSONB (React Flow compatible).
 *
 * Node shape: { id: string, type: NodeType, config: Record<string,unknown>, position?: {x,y} }
 * Edge shape: { id: string, source: string, target: string, label?: string }
 */
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1024 }),
    status: workflowStatusEnum('status').notNull().default('draft'),

    /** React-Flow node array */
    nodes: jsonb('nodes').$type<WorkflowNode[]>().notNull().default([]),
    /** React-Flow edge array */
    edges: jsonb('edges').$type<WorkflowEdge[]>().notNull().default([]),

    /** Trigger type determines when this workflow starts */
    triggerType: workflowTriggerTypeEnum('trigger_type').notNull().default('manual'),
    /** Trigger-specific configuration */
    triggerConfig: jsonb('trigger_config').$type<Record<string, unknown>>().notNull().default({}),

    /**
     * When per-step counters started being written for this workflow.
     *
     * Set once, before the first run row is inserted — which is what makes it
     * exact. Comparing a run against the first counter's own timestamp cannot
     * work: the run that starts the counters is created milliseconds before
     * them, so it would report itself as untracked.
     *
     * Null means no run has been recorded since step tracking existed, and the
     * report says "no data" instead of showing zeros.
     */
    nodeStatsSince: timestamp('node_stats_since', { withTimezone: true }),

    /** Stats — updated as runs complete */
    totalRuns: integer('total_runs').notNull().default(0),
    completedRuns: integer('completed_runs').notNull().default(0),
    failedRuns: integer('failed_runs').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('workflows_org_id_idx').on(t.orgId),
    index('workflows_status_idx').on(t.status),
    index('workflows_trigger_type_idx').on(t.triggerType),
  ],
);

// ─── Workflow runs ────────────────────────────────────────────────────────────

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),

    status: workflowRunStatusEnum('status').notNull().default('pending'),
    currentNodeId: varchar('current_node_id', { length: 255 }),

    /** Runtime data passed between nodes (merge tags, condition results, etc.) */
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),

    /** When this run should be resumed (for WaitNode) */
    nextExecutionAt: timestamp('next_execution_at', { withTimezone: true }),

    errorMessage: varchar('error_message', { length: 2048 }),

    /** A/B split branch this contact was assigned to (5.7) */
    splitBranch: varchar('split_branch', { length: 100 }),

    /** Whether contact achieved the Goal node target (5.7) */
    converted: boolean('converted').notNull().default(false),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    /** Revenue attributed to this run's conversion (for flow revenue analytics). */
    conversionValue: numeric('conversion_value', { precision: 12, scale: 2 }),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workflow_runs_workflow_id_idx').on(t.workflowId),
    index('workflow_runs_contact_id_idx').on(t.contactId),
    index('workflow_runs_status_idx').on(t.status),
    index('workflow_runs_next_execution_at_idx').on(t.nextExecutionAt),
    index('workflow_runs_org_id_idx').on(t.orgId),
  ],
);

// ─── Workflow events (custom API events for triggers) ─────────────────────────

export const workflowEvents = pgTable(
  'workflow_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    eventName: varchar('event_name', { length: 255 }).notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),

    /** Whether this event has been processed by the trigger evaluator */
    processed: boolean('processed').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workflow_events_org_id_idx').on(t.orgId),
    index('workflow_events_contact_id_idx').on(t.contactId),
    index('workflow_events_event_name_idx').on(t.eventName),
    index('workflow_events_processed_idx').on(t.processed),
    index('workflow_events_created_at_idx').on(t.createdAt),
  ],
);

// ─── TypeScript types for nodes/edges ─────────────────────────────────────────

export type NodeType =
  | 'trigger'
  | 'send_email'
  | 'send_sms'
  | 'send_whatsapp'
  | 'send_viber'
  | 'send_push'
  | 'show_in_app'
  | 'make_voice_call'
  | 'wait'
  | 'condition'
  | 'add_tag'
  | 'remove_tag'
  | 'update_field'
  | 'move_to_list'
  | 'remove_from_list'
  | 'send_webhook'
  | 'internal_notification'
  | 'smart_channel' // 5.6 — picks best channel for contact
  | 'split' // 5.7 — A/B split
  | 'goal' // 5.7 — goal conversion node
  | 'cascade' // 5.5 — cascade delivery node
  | 'assign_task' // #188 — create CRM task with round-robin assignment
  | 'send_personal_email' // #198 — 1:1 plain-text email from rep
  | 'start_workflow' // #213 — launch a child workflow (nested automation)
  | 'enroll_in_loyalty' // #239 — enroll contact in a loyalty program
  | 'award_loyalty_points' // #239 — award bonus points to a member
  | 'sync_to_ad_audience' // #307 — add/refresh contact in ad platform custom audience
  | 'stripe_retry_charge' // #314 — retry a failed Stripe invoice charge
  | 'notify_owner' // #314 — ping workspace owner via in-app / email
  | 'run_code' // #346 — user code in a sandboxed isolate
  | 'send_review_request' // §9 P1 — issue a review-request token + send the review link
  | 'unsubscribe'; // opt the contact out (status + suppression)

export interface WorkflowNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** 'true' | 'false' for condition nodes; undefined for linear edges */
  label?: string;
}

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowEvent = typeof workflowEvents.$inferSelect;
export type NewWorkflowEvent = typeof workflowEvents.$inferInsert;
