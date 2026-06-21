import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * External feed integration (#286) — pulls contact data or events from any
 * RSS/CSV/JSON URL on a configurable schedule. Each fetched row can upsert
 * contacts or fire custom events into the workflow engine.
 *
 * feedUrl:    any HTTP(S) URL
 * format:     'rss' | 'csv' | 'json'
 * mapping:    column/key → contact field or event property (JSONB)
 * schedule:   'hourly' | 'daily' | 'weekly' | 'manual'
 * action:     'upsert_contact' | 'fire_event'
 * eventName:  used when action = 'fire_event'
 */
export const externalFeeds = pgTable(
  'external_feeds',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    feedUrl: text('feed_url').notNull(),
    format: varchar('format', { length: 20 }).notNull().default('json'), // rss | csv | json
    /** JSON mapping spec: { source_field: target_contact_field | { event_prop } } */
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull().default({}),
    schedule: varchar('schedule', { length: 20 }).notNull().default('daily'), // hourly | daily | weekly | manual
    action: varchar('action', { length: 30 }).notNull().default('upsert_contact'), // upsert_contact | fire_event
    eventName: varchar('event_name', { length: 100 }),
    active: boolean('active').notNull().default(true),
    httpHeaders: jsonb('http_headers').$type<Record<string, string>>().default({}),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    lastItemCount: integer('last_item_count').default(0),
    lastError: text('last_error'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('external_feeds_org_idx').on(t.orgId),
    index('external_feeds_next_run_idx').on(t.nextRunAt, t.active),
  ],
);

export type ExternalFeed = typeof externalFeeds.$inferSelect;
export type NewExternalFeed = typeof externalFeeds.$inferInsert;
