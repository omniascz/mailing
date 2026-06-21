/**
 * Paid newsletter tiers + subscriber subscriptions.
 *
 * Allows orgs to offer free / paid tiers for their newsletters,
 * with Stripe as the payment processor. Content blocks in emails
 * can be gated to specific tier(s).
 */

import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const newsletterSubscriptionStatusEnum = pgEnum('newsletter_subscription_status', [
  'active',
  'past_due',
  'canceled',
  'trialing',
  'paused',
]);

// ─── newsletter_tiers ─────────────────────────────────────────────────────────

export const newsletterTiers = pgTable(
  'newsletter_tiers',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: varchar('org_id', { length: 36 }).notNull(),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    /** 0 = free tier; otherwise price in smallest currency unit (e.g. cents) */
    priceAmount: integer('price_amount').notNull().default(0),
    /** ISO 4217 currency code, default CZK for CZ market */
    currency: varchar('currency', { length: 3 }).notNull().default('CZK'),
    /** 'month' | 'year' | 'one_time' */
    billingInterval: varchar('billing_interval', { length: 20 }).notNull().default('month'),

    /** Stripe Price ID, null for free tier */
    stripePriceId: varchar('stripe_price_id', { length: 100 }),

    /** Markdown-formatted benefits shown on the upgrade page */
    benefitsMarkdown: text('benefits_markdown'),

    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('newsletter_tiers_org_idx').on(t.orgId),
    index('newsletter_tiers_org_active_idx').on(t.orgId, t.isActive),
  ],
);

// ─── newsletter_subscriptions ─────────────────────────────────────────────────

export const newsletterSubscriptions = pgTable(
  'newsletter_subscriptions',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: varchar('org_id', { length: 36 }).notNull(),

    contactId: varchar('contact_id', { length: 36 }).notNull(),
    tierId: varchar('tier_id', { length: 36 }).notNull(),

    status: newsletterSubscriptionStatusEnum('status').notNull().default('active'),

    /** Stripe Subscription ID, null for free tier */
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),

    /** When the current billing period ends / next renewal */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),

    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),

    trialEnd: timestamp('trial_end', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('newsletter_subs_contact_tier_uidx').on(t.contactId, t.tierId),
    index('newsletter_subs_org_idx').on(t.orgId),
    index('newsletter_subs_contact_idx').on(t.contactId),
    index('newsletter_subs_tier_idx').on(t.tierId),
    index('newsletter_subs_status_idx').on(t.status),
    index('newsletter_subs_stripe_idx').on(t.stripeSubscriptionId),
  ],
);

export type NewsletterTier = typeof newsletterTiers.$inferSelect;
export type NewsletterSubscription = typeof newsletterSubscriptions.$inferSelect;
