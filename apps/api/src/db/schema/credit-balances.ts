/**
 * Pay-As-You-Go credit wallet schema (#282).
 *
 * credit_balances    — current balance per org (denormalized for fast reads)
 * credit_transactions — append-only ledger (purchase, deduction, refund, adjustment)
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const creditBalances = pgTable(
  'credit_balances',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Current balance in USD cents (integer arithmetic avoids floating-point drift) */
    balanceCents: decimal('balance_cents', { precision: 14, scale: 0 }).notNull().default('0'),

    /** Lifetime credits purchased */
    totalPurchasedCents: decimal('total_purchased_cents', { precision: 14, scale: 0 })
      .notNull()
      .default('0'),

    /** Lifetime credits consumed */
    totalConsumedCents: decimal('total_consumed_cents', { precision: 14, scale: 0 })
      .notNull()
      .default('0'),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('credit_balances_org_uq').on(t.orgId)],
);

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * purchase   — credits added via Stripe payment
     * deduction  — credits consumed per send
     * refund     — credits returned (e.g. campaign canceled)
     * adjustment — manual admin correction
     */
    type: varchar('type', { length: 16 }).notNull(),

    /** Signed amount in cents (positive = credit added, negative = consumed) */
    amountCents: decimal('amount_cents', { precision: 14, scale: 0 }).notNull(),

    /** Running balance after this transaction */
    balanceAfterCents: decimal('balance_after_cents', { precision: 14, scale: 0 }).notNull(),

    /** Reference: Stripe PaymentIntent ID, campaign ID, etc. */
    referenceId: varchar('reference_id', { length: 255 }),
    referenceType: varchar('reference_type', { length: 64 }),

    /** Product that consumed credits: email | sms | whatsapp | voice | ai */
    product: varchar('product', { length: 32 }),

    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('credit_tx_org_idx').on(t.orgId, t.createdAt),
    index('credit_tx_ref_idx').on(t.referenceId),
  ],
);

export type CreditBalance = typeof creditBalances.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
