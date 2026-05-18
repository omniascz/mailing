import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/** Supported product-feed formats (#393). */
export const productFeedFormatEnum = pgEnum('product_feed_format', [
  'heureka',
  'zbozi',
  'google_shopping',
  'custom_xml',
]);

/** A configured product feed URL that the scheduler polls. */
export const productFeeds = pgTable(
  'product_feeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    format: productFeedFormatEnum('format').notNull(),
    url: text('url').notNull(),
    username: varchar('username', { length: 128 }),
    password: text('password'),
    pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(60),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastError: text('last_error'),
    lastItemCount: integer('last_item_count'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_feeds_org_url_uq').on(t.orgId, t.url),
    index('product_feeds_org_idx').on(t.orgId),
    index('product_feeds_next_sync_idx').on(t.lastSyncedAt),
  ],
);

export type ProductFeed = typeof productFeeds.$inferSelect;
export type NewProductFeed = typeof productFeeds.$inferInsert;
