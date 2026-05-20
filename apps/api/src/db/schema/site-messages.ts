import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const siteMessageTypeEnum = pgEnum('site_message_type', [
  'popup',
  'banner',
  'slide_in',
  'full_screen',
]);

export const siteMessageTriggerEnum = pgEnum('site_message_trigger', [
  'page_visit', // specific page URL match
  'time_on_site', // visitor has been on site N seconds
  'exit_intent', // mouse moves toward browser chrome
  'scroll_depth', // scrolled past N% of page
  'cart_value', // cart total exceeds threshold
  'returning_visitor', // not first visit
  'segment_match', // contact matches segment
  'custom_event', // specific site event fired
]);

export interface SiteMessageCondition {
  trigger: string;
  operator: 'eq' | 'contains' | 'gt' | 'gte' | 'lt' | 'in';
  value: unknown;
}

export const siteMessages = pgTable(
  'site_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    siteId: uuid('site_id'), // null = all sites in org
    name: varchar('name', { length: 255 }).notNull(),
    type: siteMessageTypeEnum('type').notNull().default('popup'),
    trigger: siteMessageTriggerEnum('trigger').notNull().default('page_visit'),

    /** Trigger-specific conditions (URL pattern, time threshold, etc.) */
    conditions: jsonb('conditions').$type<SiteMessageCondition[]>().notNull().default([]),

    /** Message content */
    headline: varchar('headline', { length: 255 }),
    body: text('body'),
    ctaText: varchar('cta_text', { length: 100 }),
    ctaUrl: varchar('cta_url', { length: 2048 }),

    /** Styling (CSS overrides, position) */
    style: jsonb('style').$type<Record<string, unknown>>().default({}),

    /** Frequency limits */
    showOncePerVisitor: boolean('show_once_per_visitor').notNull().default(true),
    showOncePerSession: boolean('show_once_per_session').notNull().default(false),
    /** Optional delay before showing (seconds) */
    delaySeconds: integer('delay_seconds').notNull().default(0),

    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('site_messages_org_idx').on(t.orgId), index('site_messages_site_idx').on(t.siteId)],
);

/** Tracks which visitors have already seen a message */
export const siteMessageImpressions = pgTable(
  'site_message_impressions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => siteMessages.id, { onDelete: 'cascade' }),
    visitorId: varchar('visitor_id', { length: 128 }).notNull(),
    contactId: uuid('contact_id'),
    clicked: boolean('clicked').notNull().default(false),
    dismissed: boolean('dismissed').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('site_msg_imp_message_idx').on(t.messageId),
    index('site_msg_imp_visitor_idx').on(t.visitorId),
  ],
);

export type SiteMessage = typeof siteMessages.$inferSelect;
export type SiteMessageImpression = typeof siteMessageImpressions.$inferSelect;
