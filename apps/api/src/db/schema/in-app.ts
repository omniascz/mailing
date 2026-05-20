/**
 * In-app messaging schema: messages, impressions, click tracking (task 7.11).
 */

import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// ─── Widget type ──────────────────────────────────────────────────────────────

export const inAppWidgetTypeEnum = pgEnum('in_app_widget_type', ['banner', 'modal', 'slideout']);

export const inAppPositionEnum = pgEnum('in_app_position', [
  'top',
  'bottom',
  'center',
  'left',
  'right',
]);

// ─── Targeting rules ──────────────────────────────────────────────────────────

export interface InAppTargetingRule {
  type: 'page_url' | 'segment' | 'event' | 'custom_field';
  operator: 'is' | 'contains' | 'starts_with' | 'in';
  value: string | string[];
}

// ─── In-app messages ──────────────────────────────────────────────────────────

export const inAppMessages = pgTable(
  'in_app_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    widgetType: inAppWidgetTypeEnum('widget_type').notNull().default('banner'),
    position: inAppPositionEnum('position').notNull().default('bottom'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    ctaLabel: text('cta_label'),
    ctaUrl: text('cta_url'),
    /** Background color hex */
    backgroundColor: text('background_color').default('#ffffff'),
    /** Text color hex */
    textColor: text('text_color').default('#000000'),
    /** Icon/image URL */
    imageUrl: text('image_url'),
    /** Targeting rules — all must match */
    targetingRules: jsonb('targeting_rules').notNull().default([]),
    /** Max shows per session (0 = unlimited) */
    maxPerSession: integer('max_per_session').notNull().default(1),
    /** Max shows per contact total (0 = unlimited) */
    maxTotal: integer('max_total').notNull().default(0),
    /** Auto-close after N seconds (0 = manual close only) */
    autoCloseSeconds: integer('auto_close_seconds').notNull().default(0),
    active: boolean('active').notNull().default(true),
    /** Campaign this message belongs to */
    campaignId: uuid('campaign_id'),
    /** Impression count */
    impressions: integer('impressions').notNull().default(0),
    /** Click count */
    clicks: integer('clicks').notNull().default(0),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('in_app_messages_org_idx').on(t.orgId),
    orgActiveIdx: index('in_app_messages_org_active_idx').on(t.orgId, t.active),
  }),
);

// ─── Impression tracking ──────────────────────────────────────────────────────

export const inAppImpressions = pgTable(
  'in_app_impressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    messageId: uuid('message_id').notNull(),
    contactId: uuid('contact_id'),
    /** Anonymous session ID for non-identified visitors */
    sessionId: text('session_id'),
    pageUrl: text('page_url'),
    /** 'shown' | 'clicked' | 'dismissed' */
    eventType: text('event_type').notNull().default('shown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    messageIdx: index('in_app_impressions_message_idx').on(t.messageId),
    contactIdx: index('in_app_impressions_contact_idx').on(t.contactId),
    sessionIdx: index('in_app_impressions_session_idx').on(t.sessionId),
  }),
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type InAppMessage = typeof inAppMessages.$inferSelect;
export type NewInAppMessage = typeof inAppMessages.$inferInsert;
export type InAppImpression = typeof inAppImpressions.$inferSelect;
