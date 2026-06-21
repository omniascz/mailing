/**
 * Meta page → org mapping for multi-org Universal Inbox routing.
 *
 * Each Facebook Page / Instagram Account is mapped to an org so the
 * unified /webhook/meta endpoint can route inbound messages to the
 * correct org without hardcoded META_ORG_ID env var.
 */

import { pgTable, uuid, varchar, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';

export const metaPageMappings = pgTable(
  'meta_page_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** Facebook Page ID or Instagram Account ID */
    pageId: varchar('page_id', { length: 64 }).notNull(),
    /** 'instagram' | 'messenger' */
    channel: varchar('channel', { length: 20 }).notNull().$type<'instagram' | 'messenger'>(),
    pageName: varchar('page_name', { length: 255 }),
    /** Page-specific access token (optional — falls back to META_PAGE_ACCESS_TOKEN env) */
    accessToken: varchar('access_token', { length: 512 }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('meta_page_mappings_page_id_channel_uniq').on(t.pageId, t.channel),
    index('meta_page_mappings_org_id_idx').on(t.orgId),
  ],
);

export type MetaPageMapping = typeof metaPageMappings.$inferSelect;
export type NewMetaPageMapping = typeof metaPageMappings.$inferInsert;
