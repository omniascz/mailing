import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, text, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

/**
 * Inbox preview jobs (Sprint E.8) — Litmus / Email on Acid bridge.
 *
 * A job represents a single render request: take this HTML+subject, run it
 * through N target email clients, capture screenshots. Results land in
 * `results` as `{ client: string; url: string; width: number; height: number }[]`
 * once the provider callback (or polling cycle) completes.
 *
 * Status: pending → running → completed | failed.
 *
 * Providers are pluggable — `provider` discriminates the integration so
 * we can fall back from Litmus to Email on Acid (or to the mock provider
 * in dev) without touching call sites.
 */
export const inboxPreviewJobs = pgTable(
  'inbox_preview_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),

    provider: varchar('provider', { length: 32 }).notNull(),
    providerJobId: varchar('provider_job_id', { length: 128 }),

    subject: varchar('subject', { length: 255 }),
    html: text('html').notNull(),
    clients: jsonb('clients').$type<string[]>().notNull().default([]),

    status: varchar('status', { length: 16 }).notNull().default('pending'),
    results: jsonb('results')
      .$type<
        Array<{
          client: string;
          url: string;
          width?: number;
          height?: number;
          thumbnailUrl?: string;
        }>
      >()
      .notNull()
      .default([]),
    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('inbox_preview_jobs_org_idx').on(t.orgId),
    index('inbox_preview_jobs_campaign_idx').on(t.campaignId),
    index('inbox_preview_jobs_status_idx').on(t.status),
  ],
);

export type InboxPreviewJob = typeof inboxPreviewJobs.$inferSelect;
export type NewInboxPreviewJob = typeof inboxPreviewJobs.$inferInsert;
