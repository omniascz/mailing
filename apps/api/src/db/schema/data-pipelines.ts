import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, text, jsonb, timestamp, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Programmable data pipelines (#357) — user-defined data-ops DAGs built from
 * a small, typed set of transform steps (filter, map, aggregate, join).
 *
 * A pipeline has a `source` (a named entity set: contacts, events, deals, ...)
 * and an ordered list of `steps`. It produces either:
 *   - a materialised dataset (pipeline_runs stores rows), or
 *   - a stream that feeds a workflow trigger / webhook.
 *
 * The runner is intentionally sandboxed: no user JS, just declarative ops.
 * Compare to #346 (run_code) which is the escape hatch for anything a
 * pipeline can't express.
 */

export const pipelineStatusEnum = pgEnum('data_pipeline_status', [
  'draft', 'active', 'inactive',
]);

export const pipelineSourceEnum = pgEnum('data_pipeline_source', [
  'contacts', 'email_events', 'deals', 'orders', 'cdp_events',
]);

export const pipelineTriggerEnum = pgEnum('data_pipeline_trigger', [
  'manual',    // run on demand
  'scheduled', // cron
  'event',     // fire on a source-table change
]);

export const dataPipelines = pgTable(
  'data_pipelines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    source: pipelineSourceEnum('source').notNull(),
    /** Ordered list of PipelineStep objects. */
    steps: jsonb('steps').$type<PipelineStep[]>().notNull().default([]),
    trigger: pipelineTriggerEnum('trigger').notNull().default('manual'),
    /** Cron expression when trigger='scheduled'. */
    schedule: varchar('schedule', { length: 64 }),
    status: pipelineStatusEnum('status').notNull().default('draft'),
    /** If set, the output is POSTed here whenever the pipeline emits rows. */
    sinkWebhookUrl: varchar('sink_webhook_url', { length: 1024 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('data_pipelines_org_name_uq').on(t.orgId, t.name),
    index('data_pipelines_org_idx').on(t.orgId),
    index('data_pipelines_status_idx').on(t.status),
  ],
);

export const dataPipelineRuns = pgTable(
  'data_pipeline_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pipelineId: uuid('pipeline_id').notNull()
      .references(() => dataPipelines.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    inputCount: varchar('input_count', { length: 16 }),
    outputCount: varchar('output_count', { length: 16 }),
    errorMessage: text('error_message'),
    /** For debugging — first N output rows. */
    preview: jsonb('preview').$type<unknown[]>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('data_pipeline_runs_pipeline_idx').on(t.pipelineId),
    index('data_pipeline_runs_org_idx').on(t.orgId),
  ],
);

// ─── Step AST ─────────────────────────────────────────────────────────────────

export type Predicate =
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown }
  | { field: string; op: 'contains' | 'not_contains'; value: string }
  | { field: string; op: 'is_null' | 'is_not_null' }
  | { and: Predicate[] }
  | { or: Predicate[] };

export interface FilterStep { type: 'filter'; predicate: Predicate }
export interface MapStep { type: 'map'; projection: Record<string, string | { $field: string }> }
export interface AggregateStep {
  type: 'aggregate';
  groupBy: string[];
  metrics: Record<string, { op: 'count' | 'sum' | 'avg' | 'min' | 'max'; field?: string }>;
}
export interface JoinStep {
  type: 'join';
  rightSource: 'contacts' | 'email_events' | 'deals' | 'orders' | 'cdp_events';
  on: { left: string; right: string };
  kind: 'inner' | 'left';
  select?: string[]; // columns from the right side to merge in
}
export interface LimitStep { type: 'limit'; count: number }
export interface SortStep { type: 'sort'; by: Array<{ field: string; dir: 'asc' | 'desc' }> }

export type PipelineStep =
  | FilterStep | MapStep | AggregateStep | JoinStep | LimitStep | SortStep;

export type DataPipeline = typeof dataPipelines.$inferSelect;
export type NewDataPipeline = typeof dataPipelines.$inferInsert;
export type DataPipelineRun = typeof dataPipelineRuns.$inferSelect;

// For use when a pipeline row is also a predicate source.
export function stepUsesField(step: PipelineStep): string[] {
  switch (step.type) {
    case 'filter':    return collectPredicateFields(step.predicate);
    case 'map':       return Object.values(step.projection)
                        .map((v) => (typeof v === 'string' ? v : v.$field));
    case 'aggregate': return [...step.groupBy,
                        ...Object.values(step.metrics).map((m) => m.field).filter(Boolean) as string[]];
    case 'join':      return [step.on.left];
    case 'sort':      return step.by.map((b) => b.field);
    case 'limit':     return [];
  }
}

function collectPredicateFields(p: Predicate, acc: string[] = []): string[] {
  if ('and' in p) { for (const sub of p.and) collectPredicateFields(sub, acc); return acc; }
  if ('or' in p)  { for (const sub of p.or)  collectPredicateFields(sub, acc); return acc; }
  acc.push(p.field);
  return acc;
}
