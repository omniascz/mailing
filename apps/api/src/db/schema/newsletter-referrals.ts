/**
 * Newsletter referral program.
 *
 * Each subscriber gets a unique referral code embedded in their emails via
 * the {{referral_url}} merge tag. When a referred person subscribes via
 * GET /r/:code → records the click → on list confirmation fires a trigger
 * that marks the referral converted and optionally awards the referrer.
 *
 * Reward types:
 *   'tier_upgrade'     — upgrade referrer to a higher tier for N months
 *   'loyalty_points'   — add loyalty_points to referrer's balance
 *   'stripe_credit'    — add Stripe balance credit
 *   'webhook'          — fire a webhook for custom reward logic
 */

import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const referralRewardTypeEnum = pgEnum('referral_reward_type', [
  'tier_upgrade',
  'loyalty_points',
  'stripe_credit',
  'webhook',
  'none',
]);

// ─── newsletter_referral_programs ─────────────────────────────────────────────

export const newsletterReferralPrograms = pgTable(
  'newsletter_referral_programs',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: varchar('org_id', { length: 36 }).notNull(),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    /** How many successful conversions needed per reward */
    conversionsPerReward: integer('conversions_per_reward').notNull().default(1),

    rewardType: referralRewardTypeEnum('reward_type').notNull().default('none'),
    /** For tier_upgrade: tier_id; for loyalty_points: point amount as string; for stripe_credit: amount in cents */
    rewardValue: varchar('reward_value', { length: 255 }),

    /** Workflow to fire on conversion event (nullable) */
    workflowId: varchar('workflow_id', { length: 36 }),

    isActive: integer('is_active').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('referral_programs_org_idx').on(t.orgId)],
);

// ─── newsletter_referrals ─────────────────────────────────────────────────────

export const newsletterReferrals = pgTable(
  'newsletter_referrals',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: varchar('org_id', { length: 36 }).notNull(),
    programId: varchar('program_id', { length: 36 }).notNull(),

    /** The contact who referred */
    referrerContactId: varchar('referrer_contact_id', { length: 36 }).notNull(),

    /** Short unique code embedded in referral links */
    code: varchar('code', { length: 20 }).notNull(),

    /** How many times the referral link was clicked */
    clickCount: integer('click_count').notNull().default(0),

    /** How many referred contacts have confirmed their subscription */
    conversionCount: integer('conversion_count').notNull().default(0),

    /** How many rewards have been issued to the referrer */
    rewardsIssued: integer('rewards_issued').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('newsletter_referrals_code_uidx').on(t.code),
    uniqueIndex('newsletter_referrals_referrer_prog_uidx').on(t.referrerContactId, t.programId),
    index('newsletter_referrals_org_idx').on(t.orgId),
    index('newsletter_referrals_program_idx').on(t.programId),
  ],
);

// ─── newsletter_referral_events ───────────────────────────────────────────────

export const newsletterReferralEvents = pgTable(
  'newsletter_referral_events',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    referralId: varchar('referral_id', { length: 36 }).notNull(),
    orgId: varchar('org_id', { length: 36 }).notNull(),

    /** 'click' | 'signup' | 'confirmed' | 'reward_issued' */
    eventType: varchar('event_type', { length: 30 }).notNull(),

    /** Email of the referred person (before they're a contact) */
    referredEmail: varchar('referred_email', { length: 255 }),
    /** Once confirmed, this is set */
    referredContactId: varchar('referred_contact_id', { length: 36 }),

    ip: varchar('ip', { length: 45 }),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('referral_events_referral_idx').on(t.referralId),
    index('referral_events_org_idx').on(t.orgId),
    index('referral_events_type_idx').on(t.eventType),
  ],
);

export type NewsletterReferralProgram = typeof newsletterReferralPrograms.$inferSelect;
export type NewsletterReferral = typeof newsletterReferrals.$inferSelect;
export type NewsletterReferralEvent = typeof newsletterReferralEvents.$inferSelect;
