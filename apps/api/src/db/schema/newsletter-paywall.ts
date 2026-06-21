/**
 * Newsletter paywall — gated premium content inside emails.
 * Non-subscribers see a blur + upgrade CTA; subscribers see full content.
 * Like Beehiiv/Substack but built into ForgeMsg for any email campaign.
 */
import {
  pgTable, uuid, text, timestamp, integer, boolean, numeric, jsonb, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core';

export const paywallTierEnum = pgEnum('paywall_tier', [
  'free', 'basic', 'premium', 'vip',
]);

/** Subscription plan for gated newsletter content */
export const newsletterPlans = pgTable(
  'newsletter_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    tier: paywallTierEnum('tier').notNull(),
    priceCzkMonthly: numeric('price_czk_monthly', { precision: 8, scale: 2 }),
    priceEurMonthly: numeric('price_eur_monthly', { precision: 8, scale: 2 }),
    /** Stripe price ID for recurring billing */
    stripePriceId: text('stripe_price_id'),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    subscriberCount: integer('subscriber_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('newsletter_plans_org_idx').on(t.orgId),
  }),
);

/** Who has subscribed to which plan */
export const newsletterPaidSubscriptions = pgTable(
  'newsletter_paid_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    planId: uuid('plan_id').notNull(),
    tier: paywallTierEnum('tier').notNull(),
    status: text('status').notNull().default('active'), // active | cancelled | past_due
    stripeSubscriptionId: text('stripe_subscription_id'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgContactIdx: uniqueIndex('newsletter_sub_org_contact_idx').on(t.orgId, t.contactId, t.planId),
    orgIdx: index('newsletter_sub_org_idx').on(t.orgId),
  }),
);

export type NewsletterPlan = typeof newsletterPlans.$inferSelect;
export type NewsletterPaidSubscription = typeof newsletterPaidSubscriptions.$inferSelect;
