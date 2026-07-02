import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import type { ReportDimension, ReportMetric } from '../../services/report-builder/pure.js';

/**
 * Saved custom-report definitions for the report builder. `definition` holds the
 * metrics × dimension plus optional default filters (campaign / relative range),
 * so a saved report can be re-run on demand or by a scheduled report.
 */
export interface CustomReportDefinition {
  metrics: ReportMetric[];
  dimension: ReportDimension;
  /** Optional default filters applied when the report is run without overrides. */
  campaignId?: string;
  /** Relative window in days (e.g. 30 → last 30 days). */
  rangeDays?: number;
}

export const customReports = pgTable(
  'custom_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    definition: jsonb('definition').$type<CustomReportDefinition>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('custom_reports_org_idx').on(t.orgId)],
);

export type CustomReport = typeof customReports.$inferSelect;
