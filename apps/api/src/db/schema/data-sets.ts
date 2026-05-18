import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
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
 * Data Sets (#356/L4-5). Named queries reusable across reports + dashboards.
 * A data set is a parametrised saved query — callers pass `params` at run
 * time and get a cached result back.
 */

export const dataSetKindEnum = pgEnum('data_set_kind', [
  'sql',        // raw whitelisted SQL
  'segment',    // contact segment definition
  'aggregate',  // preconfigured analytics aggregate
]);

export const dataSets = pgTable(
  'data_sets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    kind: dataSetKindEnum('kind').notNull().default('sql'),

    /** Parameter declarations: [{ name, type: 'string'|'number'|'date', required, default? }] */
    parameters: jsonb('parameters')
      .$type<Array<{ name: string; type: 'string' | 'number' | 'date'; required?: boolean; defaultValue?: unknown }>>()
      .notNull()
      .default([]),

    /** SQL template with `:paramName` placeholders, or segment query JSON. */
    definition: text('definition').notNull(),

    /** Columns the data set returns, for chart-type inference + UI. */
    columns: jsonb('columns')
      .$type<Array<{ name: string; kind: 'string' | 'number' | 'date' | 'boolean' }>>()
      .notNull()
      .default([]),

    /** TTL for the cached result in seconds. 0 = always re-run. */
    cacheTtlSeconds: integer('cache_ttl_seconds').notNull().default(300),

    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('data_sets_org_name_uq').on(t.orgId, t.name),
    index('data_sets_org_idx').on(t.orgId),
  ],
);

export type DataSet = typeof dataSets.$inferSelect;
export type NewDataSet = typeof dataSets.$inferInsert;
