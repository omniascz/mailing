/**
 * Customer subscriptions — Commerce Hub (#313).
 *
 * This is the CUSTOMER-facing subscription table: an org sells recurring
 * products to its customers (contacts). Each subscription drives periodic
 * invoice generation.
 *
 * Distinct from `billing_subscriptions`, which tracks the org's OWN plan
 * with ForgeMsg (Stripe customer = org itself).
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  jsonb,
  timestamp,
  index,
  text,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { deals } from './deals.js';

export interface SubscriptionLineItem {
  productId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  /** Tax rate percent (0-100) for this line. */
  taxRate?: number;
  metadata?: Record<string, unknown>;
}

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),

    /** Human-readable subscription number, e.g. SUB-2026-000123 */
    subscriptionNumber: varchar('subscription_number', { length: 64 }).notNull(),

    /** active | trialing | past_due | paused | canceled | expired */
    status: varchar('status', { length: 32 }).notNull().default('active'),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),

    /** Line items at current cycle (array, see SubscriptionLineItem) */
    lineItems: jsonb('line_items').$type<SubscriptionLineItem[]>().notNull().default([]),

    /** Derived from line items; recomputed on update */
    mrr: numeric('mrr', { precision: 18, scale: 2 }).notNull().default('0'),

    /** Billing cadence */
    billingInterval: varchar('billing_interval', { length: 16 }).notNull().default('month'), // day|week|month|quarter|year
    billingIntervalCount: integer('billing_interval_count').notNull().default(1),
    billingAnchor: integer('billing_anchor'), // day of month for monthly, 1-31

    /** Active contract window */
    startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }), // fixed-term end (null = evergreen)
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    nextInvoiceAt: timestamp('next_invoice_at', { withTimezone: true }).notNull(),

    /** Cancellation */
    cancelAt: timestamp('cancel_at', { withTimezone: true }), // if user scheduled cancel later
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),

    /** Dunning state */
    pastDueSince: timestamp('past_due_since', { withTimezone: true }),
    dunningAttempts: integer('dunning_attempts').notNull().default(0),

    /** External refs */
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('subscriptions_org_idx').on(t.orgId),
    index('subscriptions_contact_idx').on(t.contactId),
    index('subscriptions_org_status_idx').on(t.orgId, t.status),
    index('subscriptions_next_invoice_idx').on(t.nextInvoiceAt),
    index('subscriptions_stripe_idx').on(t.stripeSubscriptionId),
  ],
);

/**
 * Audit trail of plan changes (upgrade/downgrade with proration).
 */
export const subscriptionChanges = pgTable(
  'subscription_changes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    /** upgrade | downgrade | quantity_change | cancel | reactivate | pause | resume | plan_swap */
    changeType: varchar('change_type', { length: 32 }).notNull(),

    previousLineItems: jsonb('previous_line_items')
      .$type<SubscriptionLineItem[]>()
      .notNull()
      .default([]),
    newLineItems: jsonb('new_line_items').$type<SubscriptionLineItem[]>().notNull().default([]),

    previousMrr: numeric('previous_mrr', { precision: 18, scale: 2 }).notNull().default('0'),
    newMrr: numeric('new_mrr', { precision: 18, scale: 2 }).notNull().default('0'),

    prorationAmount: numeric('proration_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0'),
    prorationInvoiceId: uuid('proration_invoice_id'),

    /** When the change becomes active: immediate|next_period|custom */
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    changedByUserId: uuid('changed_by_user_id'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscription_changes_sub_idx').on(t.subscriptionId),
    index('subscription_changes_org_idx').on(t.orgId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionChange = typeof subscriptionChanges.$inferSelect;
export type NewSubscriptionChange = typeof subscriptionChanges.$inferInsert;
