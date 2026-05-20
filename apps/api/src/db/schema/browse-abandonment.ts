/**
 * Browse abandonment / retargeting schema — #85
 *
 * Records product-page views per contact. The abandonment checker runs
 * periodically and fires a `browse_abandoned` workflow event for contacts
 * who viewed products but did not place an order within the configured window.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

// ─── Page view events ─────────────────────────────────────────────────────────

export interface BrowseEventMeta {
  url?: string;
  referrer?: string;
  sessionId?: string;
  /** User agent (truncated) */
  ua?: string;
}

/**
 * One row per contact-sku page view (upserted on repeat visits so last_viewed_at
 * stays current and view_count accumulates).
 */
export const productPageViews = pgTable(
  'product_page_views',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    /** Anonymous visitor token (before identification) */
    visitorToken: varchar('visitor_token', { length: 128 }),
    /** Product SKU viewed */
    sku: varchar('sku', { length: 128 }),
    productName: varchar('product_name', { length: 512 }),
    productUrl: varchar('product_url', { length: 2048 }),
    /** Number of times this contact/visitor viewed this product */
    viewCount: integer('view_count').notNull().default(1),
    firstViewedAt: timestamp('first_viewed_at', { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb('meta').$type<BrowseEventMeta>().notNull().default({}),
  },
  (t) => [
    // Unique per (org, contact, sku) so we can upsert
    uniqueIndex('product_page_views_contact_sku_uq').on(t.orgId, t.contactId, t.sku),
    index('product_page_views_org_idx').on(t.orgId),
    index('product_page_views_contact_idx').on(t.contactId),
    index('product_page_views_last_viewed_idx').on(t.lastViewedAt),
    index('product_page_views_visitor_idx').on(t.visitorToken),
  ],
);

// ─── Abandonment tracking ─────────────────────────────────────────────────────

/**
 * Tracks which contacts have already been targeted for a browse-abandonment
 * workflow, preventing repeat fires within the suppression window.
 */
export const browseAbandonmentFires = pgTable(
  'browse_abandonment_fires',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    /** SKU that triggered this fire, or null for generic abandonment */
    sku: varchar('sku', { length: 128 }),
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
    /** False until the contact completes a purchase (suppresses re-trigger) */
    converted: boolean('converted').notNull().default(false),
  },
  (t) => [
    index('browse_abandonment_fires_org_contact_idx').on(t.orgId, t.contactId),
    index('browse_abandonment_fires_fired_at_idx').on(t.firedAt),
  ],
);

export type ProductPageView = typeof productPageViews.$inferSelect;
export type NewProductPageView = typeof productPageViews.$inferInsert;
export type BrowseAbandonmentFire = typeof browseAbandonmentFires.$inferSelect;
