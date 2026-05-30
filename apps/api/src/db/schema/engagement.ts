import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

/**
 * Per-contact engagement profile — used by Send Time Optimization,
 * Timewarp and predictive segmentation.
 */
export const contactEngagement = pgTable(
  'contact_engagement',
  {
    contactId: uuid('contact_id')
      .primaryKey()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Timezone (IANA string, e.g. Europe/Prague) — inferred from locale/geo.
    timezone: varchar('timezone', { length: 100 }),

    // Histogram of opens per hour-of-day 0..23 and day-of-week 0..6 (Sun=0).
    openHourHistogram: jsonb('open_hour_histogram')
      .$type<number[]>()
      .notNull()
      .default(Array(24).fill(0)),
    openDayHistogram: jsonb('open_day_histogram')
      .$type<number[]>()
      .notNull()
      .default(Array(7).fill(0)),

    // Aggregate engagement counters.
    totalOpens: integer('total_opens').notNull().default(0),
    totalClicks: integer('total_clicks').notNull().default(0),
    totalSends: integer('total_sends').notNull().default(0),

    // Commerce aggregates (used for CLV + purchase likelihood).
    totalOrders: integer('total_orders').notNull().default(0),
    totalRevenue: decimal('total_revenue', { precision: 14, scale: 2 }).notNull().default('0'),
    lastOrderAt: timestamp('last_order_at', { withTimezone: true }),
    firstOrderAt: timestamp('first_order_at', { withTimezone: true }),

    // Predictive scores (refreshed nightly).
    predictedClv: decimal('predicted_clv', { precision: 14, scale: 2 }),
    purchaseLikelihood: decimal('purchase_likelihood', { precision: 4, scale: 3 }),
    churnRisk: decimal('churn_risk', { precision: 4, scale: 3 }),
    predictedAt: timestamp('predicted_at', { withTimezone: true }),

    // RFM scoring (1–5 each, rfmScore = R*100 + F*10 + M).
    rfmRecency: integer('rfm_recency'),
    rfmFrequency: integer('rfm_frequency'),
    rfmMonetary: integer('rfm_monetary'),
    rfmScore: integer('rfm_score'),
    rfmSegment: varchar('rfm_segment', { length: 32 }),

    // Next-order prediction.
    predictedNextOrderAt: timestamp('predicted_next_order_at', { withTimezone: true }),
    avgOrderIntervalDays: integer('avg_order_interval_days'),

    // Channel scoring per recipient (§9 P1). 0–100 per channel; null when
    // no signal at all. preferred_channel is argmax cached on write.
    emailScore: integer('email_score'),
    smsScore: integer('sms_score'),
    whatsappScore: integer('whatsapp_score'),
    voiceScore: integer('voice_score'),
    pushScore: integer('push_score'),
    preferredChannel: varchar('preferred_channel', { length: 16 }),
    channelScoredAt: timestamp('channel_scored_at', { withTimezone: true }),

    // Engagement Score proprietary (§9 P1). Cross-channel composite 0-100;
    // band is one of highly_engaged / engaged / at_risk / dormant / cold.
    engagementScore: integer('engagement_score'),
    engagementBand: varchar('engagement_band', { length: 20 }),
    engagementScoredAt: timestamp('engagement_scored_at', { withTimezone: true }),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contact_engagement_org_idx').on(t.orgId)],
);

export type ContactEngagement = typeof contactEngagement.$inferSelect;
