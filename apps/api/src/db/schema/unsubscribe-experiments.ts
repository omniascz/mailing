import { pgTable, text, timestamp, integer, boolean, real } from 'drizzle-orm/pg-core';

/** A/B test different unsubscribe page flows to rescue subscribers. */
export const unsubscribeExperiments = pgTable('unsubscribe_experiments', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // draft | active | paused | completed
  winnerVariantId: text('winner_variant_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const unsubscribeVariants = pgTable('unsubscribe_variants', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  experimentId: text('experiment_id').notNull(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  /** Flow: immediate_unsub | offer_pause | offer_downgrade | offer_preferences | offer_reason */
  flow: text('flow').notNull(),
  headline: text('headline'),
  bodyText: text('body_text'),
  ctaLabel: text('cta_label'),
  pauseDays: integer('pause_days'), // for offer_pause flow
  trafficWeight: real('traffic_weight').notNull().default(0.5), // 0-1
  impressions: integer('impressions').notNull().default(0),
  savedCount: integer('saved_count').notNull().default(0), // clicked "stay subscribed"
  unsubCount: integer('unsub_count').notNull().default(0), // still unsubscribed
  isControl: boolean('is_control').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UnsubscribeExperiment = typeof unsubscribeExperiments.$inferSelect;
export type UnsubscribeVariant = typeof unsubscribeVariants.$inferSelect;
