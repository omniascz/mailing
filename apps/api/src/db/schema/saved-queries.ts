import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

/**
 * Saved NL → SQL queries (#272/L4-4). Users ask a question once, pin it,
 * and re-run on a schedule or from a dashboard.
 */
export const savedQueries = pgTable(
  'saved_queries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    /** Free-text question typed into the NL box. */
    question: text('question').notNull(),

    /** Whether the query is visible to the whole org or only the owner. */
    visibility: varchar('visibility', { length: 16 }).notNull().default('org'),

    /** Last executed SQL (cache for fast re-run) — updated on every run. */
    lastSql: text('last_sql'),
    /** Chart hint returned by nl-query. */
    lastChartType: varchar('last_chart_type', { length: 32 }),

    /** Number of times this saved query has been executed. */
    runCount: integer('run_count').notNull().default(0),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastRunDurationMs: integer('last_run_duration_ms'),

    /** Pinned to dashboards that reference this id via their config. */
    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('saved_queries_org_idx').on(t.orgId),
    index('saved_queries_owner_idx').on(t.ownerUserId),
    uniqueIndex('saved_queries_org_name_uq').on(t.orgId, t.name),
  ],
);

export type SavedQuery = typeof savedQueries.$inferSelect;
export type NewSavedQuery = typeof savedQueries.$inferInsert;
