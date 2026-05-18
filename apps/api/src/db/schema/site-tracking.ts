import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Tracked sites (connected domains) ──────────────────────────────────────

export const trackedSites = pgTable('tracked_sites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  /** Public token embedded in the JS snippet */
  siteToken: varchar('site_token', { length: 64 }).notNull().unique(),
  domain: varchar('domain', { length: 253 }).notNull(),
  name: varchar('name', { length: 255 }),
  trackingEnabled: boolean('tracking_enabled').notNull().default(true),
  /** Enable cross-domain cookie sync via redirect token */
  crossDomainSync: boolean('cross_domain_sync').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tracked_sites_org_idx').on(t.orgId),
  uniqueIndex('tracked_sites_org_domain_idx').on(t.orgId, t.domain),
]);

// ─── Site page views ──────────────────────────────────────────────────────────

export const sitePageViews = pgTable('site_page_views', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id').notNull().references(() => trackedSites.id, { onDelete: 'cascade' }),
  /** Visitor cookie (anonymous or identified) */
  visitorId: varchar('visitor_id', { length: 128 }).notNull(),
  /** Resolved contact if identified */
  contactId: uuid('contact_id'),
  url: text('url').notNull(),
  path: varchar('path', { length: 2048 }),
  referrer: text('referrer'),
  title: text('title'),
  utmSource: varchar('utm_source', { length: 255 }),
  utmMedium: varchar('utm_medium', { length: 255 }),
  utmCampaign: varchar('utm_campaign', { length: 255 }),
  utmContent: varchar('utm_content', { length: 255 }),
  sessionId: varchar('session_id', { length: 128 }),
  /** Duration on page in seconds (updated on next page view or explicit unload) */
  durationSeconds: integer('duration_seconds'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('site_page_views_org_idx').on(t.orgId),
  index('site_page_views_site_idx').on(t.siteId),
  index('site_page_views_visitor_idx').on(t.visitorId),
  index('site_page_views_contact_idx').on(t.contactId),
  index('site_page_views_occurred_idx').on(t.occurredAt),
]);

// ─── Site custom events ───────────────────────────────────────────────────────

export const siteEvents = pgTable('site_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id').notNull().references(() => trackedSites.id, { onDelete: 'cascade' }),
  visitorId: varchar('visitor_id', { length: 128 }).notNull(),
  contactId: uuid('contact_id'),
  eventName: varchar('event_name', { length: 255 }).notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('site_events_org_idx').on(t.orgId),
  index('site_events_visitor_idx').on(t.visitorId),
  index('site_events_name_idx').on(t.orgId, t.eventName),
  index('site_events_contact_idx').on(t.contactId),
]);

export type TrackedSite = typeof trackedSites.$inferSelect;
export type SitePageView = typeof sitePageViews.$inferSelect;
export type SiteEvent = typeof siteEvents.$inferSelect;
