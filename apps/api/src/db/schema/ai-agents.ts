import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';

export const agentStatusEnum = pgEnum('agent_status', ['active', 'paused', 'archived']);
export const agentRunStatusEnum = pgEnum('agent_run_status', ['pending', 'running', 'completed', 'failed', 'cancelled']);

export const aiAgents = pgTable('ai_agents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  /** Agent type — determines which runner handles it */
  agentType: varchar('agent_type', { length: 50 }).notNull(),
  // Types: 'campaign_builder' | 'contact_cleanup' | 'segment_optimizer' | 're_engagement' | 'custom'
  description: text(),
  /** Serialized goal / instructions for the agent */
  goal: text().notNull(),
  /** JSON config: schedule, filters, thresholds */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  status: agentStatusEnum('status').notNull().default('active'),
  /** Cron expression for scheduled agents, null = manual only */
  schedule: varchar('schedule', { length: 100 }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('ai_agents_org_idx').on(t.orgId),
  index('ai_agents_org_type_idx').on(t.orgId, t.agentType),
  index('ai_agents_next_run_idx').on(t.nextRunAt),
]);

export const aiAgentRuns = pgTable('ai_agent_runs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  agentId: uuid('agent_id').notNull().references(() => aiAgents.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull(),
  status: agentRunStatusEnum('status').notNull().default('pending'),
  /** Input context passed to the agent */
  input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
  /** Final output / result of the agent run */
  output: jsonb('output').$type<Record<string, unknown>>(),
  /** Error message if status=failed */
  error: text(),
  /** Token usage */
  tokensUsed: integer('tokens_used'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('ai_agent_runs_agent_idx').on(t.agentId),
  index('ai_agent_runs_org_idx').on(t.orgId),
  index('ai_agent_runs_status_idx').on(t.status),
]);

export type AiAgent = typeof aiAgents.$inferSelect;
export type NewAiAgent = typeof aiAgents.$inferInsert;
export type AiAgentRun = typeof aiAgentRuns.$inferSelect;
