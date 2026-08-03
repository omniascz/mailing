import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const czPaymentGatewaySettings = pgTable('cz_payment_gateway_settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull().unique(),
  gopayClientId: text('gopay_client_id'),
  gopayClientSecret: text('gopay_client_secret'),
  gopayGoId: text('gopay_go_id'),
  gopayTestMode: text('gopay_test_mode').default('false'),
  comgateMerchant: text('comgate_merchant'),
  comgateSecret: text('comgate_secret'),
  comgateTestMode: text('comgate_test_mode').default('false'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const czPaymentTransactions = pgTable('cz_payment_transactions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull(),
  contactId: text('contact_id'),
  gateway: text('gateway').notNull(), // gopay | comgate
  gatewayId: text('gateway_id').notNull(),
  amount: text('amount').notNull(),
  currency: text('currency').notNull().default('CZK'),
  status: text('status').notNull().default('pending'),
  returnUrl: text('return_url'),
  notifyUrl: text('notify_url'),
  description: text('description'),
  rawData: jsonb('raw_data').$type<Record<string, unknown>>(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CzPaymentTransaction = typeof czPaymentTransactions.$inferSelect;
