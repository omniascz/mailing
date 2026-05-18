import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, integer, jsonb, index, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const importJobStatusEnum = pgEnum('import_job_status', [
  'uploaded',
  'mapped',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const importJobFormatEnum = pgEnum('import_job_format', ['csv', 'xlsx']);

export type ImportColumnMapping = Record<string, string>;

export interface ImportError {
  row: number;
  reason: string;
  value?: unknown;
}

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),

    filename: varchar('filename', { length: 255 }).notNull(),
    format: importJobFormatEnum('format').notNull(),
    fileSize: integer('file_size').notNull(),
    storagePath: varchar('storage_path', { length: 512 }).notNull(),

    status: importJobStatusEnum('status').notNull().default('uploaded'),

    detectedColumns: jsonb('detected_columns').$type<string[]>().notNull().default([]),
    sampleRows: jsonb('sample_rows').$type<Record<string, string>[]>().notNull().default([]),
    columnMapping: jsonb('column_mapping').$type<ImportColumnMapping>(),
    defaultListId: uuid('default_list_id'),

    totalRows: integer('total_rows').notNull().default(0),
    processedRows: integer('processed_rows').notNull().default(0),
    insertedRows: integer('inserted_rows').notNull().default(0),
    updatedRows: integer('updated_rows').notNull().default(0),
    skippedRows: integer('skipped_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    errors: jsonb('errors').$type<ImportError[]>().notNull().default([]),

    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('import_jobs_org_id_idx').on(t.orgId),
    index('import_jobs_org_status_idx').on(t.orgId, t.status),
  ],
);

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
