import { pgTable, uuid, varchar, text, numeric, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { deals } from './deals.js';
import { contacts } from './contacts.js';

export const invoices = pgTable('invoices', {
  id:              uuid('id').primaryKey().defaultRandom(),
  orgId:           uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  dealId:          uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
  contactId:       uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  invoiceNumber:   varchar('invoice_number', { length: 64 }).notNull(),
  status:          varchar('status', { length: 32 }).notNull().default('draft'), // draft|sent|paid|overdue|void
  currency:        varchar('currency', { length: 3 }).notNull().default('USD'),
  lineItems:       jsonb('line_items').notNull().default([]),
  subtotal:        numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0'),
  taxTotal:        numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
  total:           numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
  amountPaid:      numeric('amount_paid', { precision: 18, scale: 2 }).notNull().default('0'),
  amountDue:       numeric('amount_due', { precision: 18, scale: 2 }).notNull().default('0'),
  dueDate:         timestamp('due_date', { withTimezone: true }),
  notes:           text('notes'),
  // Payment
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  stripeInvoiceId:       varchar('stripe_invoice_id', { length: 255 }),
  paidAt:          timestamp('paid_at', { withTimezone: true }),
  pdfUrl:          text('pdf_url'),
  // Reminder tracking
  remindersSent:   integer('reminders_sent').notNull().default(0),
  lastReminderAt:  timestamp('last_reminder_at', { withTimezone: true }),
  metadata:        jsonb('metadata').default({}),
  sentAt:          timestamp('sent_at', { withTimezone: true }),
  voidedAt:        timestamp('voided_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx:       index('invoices_org_idx').on(t.orgId),
  dealIdx:      index('invoices_deal_idx').on(t.dealId),
  statusIdx:    index('invoices_org_status_idx').on(t.orgId, t.status),
  dueDateIdx:   index('invoices_due_date_idx').on(t.dueDate),
  stripeIdx:    index('invoices_stripe_pi_idx').on(t.stripePaymentIntentId),
}));

export type Invoice = typeof invoices.$inferSelect;
