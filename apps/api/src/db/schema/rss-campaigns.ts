import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { lists } from './lists.js';

/**
 * RSS-to-email automation — MailForge periodically polls a feed, builds
 * a campaign from new items, and sends to the configured list.
 */
export const rssCampaigns = pgTable(
  'rss_campaigns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    feedUrl: varchar('feed_url', { length: 1024 }).notNull(),
    listId: uuid('list_id').references(() => lists.id, { onDelete: 'set null' }),
    frequency: varchar('frequency', { length: 20 }).notNull().default('daily'), // hourly | daily | weekly
    sendTime: varchar('send_time', { length: 5 }).notNull().default('09:00'),
    timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
    fromName: varchar('from_name', { length: 100 }),
    fromEmail: varchar('from_email', { length: 255 }),
    subjectTemplate: varchar('subject_template', { length: 255 }).notNull().default('{{rss.title}}'),
    active: boolean('active').notNull().default(true),
    lastSeenGuids: jsonb('last_seen_guids').$type<string[]>().notNull().default([]),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rss_campaigns_org_idx').on(t.orgId),
    index('rss_campaigns_next_run_idx').on(t.nextRunAt),
  ],
);

export type RssCampaign = typeof rssCampaigns.$inferSelect;
export type NewRssCampaign = typeof rssCampaigns.$inferInsert;
