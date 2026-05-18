import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const scheduledReports = pgTable(
  'scheduled_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    reportType: varchar('report_type', { length: 64 }).notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    recipients: jsonb('recipients').$type<string[]>().notNull().default([]),
    frequency: varchar('frequency', { length: 16 }).notNull().default('weekly'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scheduled_reports_next_run_idx').on(t.nextRunAt)],
);

export type ScheduledReport = typeof scheduledReports.$inferSelect;
