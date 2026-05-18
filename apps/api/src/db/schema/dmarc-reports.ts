import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const dmarcReports = pgTable('dmarc_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

  /** ISP-assigned report identifier — unique per reporter */
  reportId: varchar('report_id', { length: 255 }).notNull(),
  /** Reporting organization (e.g. 'Google Inc.', 'Yahoo') */
  reporterOrg: varchar('reporter_org', { length: 255 }).notNull(),
  /** Sending domain this report covers */
  domain: varchar('domain', { length: 253 }).notNull(),

  dateBegin: timestamp('date_begin', { withTimezone: true }).notNull(),
  dateEnd: timestamp('date_end', { withTimezone: true }).notNull(),

  /** Parsed policy_published block */
  policy: jsonb('policy').$type<{
    domain: string; adkim: string; aspf: string; p: string; pct: number;
  }>().notNull().default({ domain: '', adkim: 'r', aspf: 'r', p: 'none', pct: 100 }),

  /** Array of individual IP/count/result records */
  records: jsonb('records').$type<Array<{
    sourceIp: string; count: number; disposition: string;
    dkim: string; spf: string; headerFrom: string; envelopeFrom: string;
  }>>().notNull().default([]),

  totalMessages: integer('total_messages').notNull().default(0),
  passCount: integer('pass_count').notNull().default(0),
  failCount: integer('fail_count').notNull().default(0),

  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('dmarc_reports_org_domain_idx').on(t.orgId, t.domain),
  index('dmarc_reports_date_end_idx').on(t.orgId, t.dateEnd),
  uniqueIndex('dmarc_reports_org_reporter_id_idx').on(t.orgId, t.reporterOrg, t.reportId),
]);

export type DmarcReport = typeof dmarcReports.$inferSelect;
