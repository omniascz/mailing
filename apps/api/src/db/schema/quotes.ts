import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { deals } from './deals.js';
import { contacts } from './contacts.js';

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    quoteNumber: varchar('quote_number', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('draft'), // draft|sent|viewed|accepted|rejected|expired
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    lineItems: jsonb('line_items').notNull().default([]), // [{productId,sku,name,qty,unitPrice,discount,total}]
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0'),
    discountTotal: numeric('discount_total', { precision: 18, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    notes: text('notes'),
    terms: text('terms'),
    // e-signature
    signatureToken: varchar('signature_token', { length: 128 }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedByName: varchar('signed_by_name', { length: 255 }),
    signedByIp: varchar('signed_by_ip', { length: 64 }),
    // external e-sign provider
    esignProvider: varchar('esign_provider', { length: 32 }),
    esignEnvelopeId: varchar('esign_envelope_id', { length: 255 }),
    esignStatus: varchar('esign_status', { length: 32 }),
    pdfUrl: text('pdf_url'),
    metadata: jsonb('metadata').default({}),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('quotes_org_idx').on(t.orgId),
    dealIdx: index('quotes_deal_idx').on(t.dealId),
    tokenIdx: index('quotes_token_idx').on(t.signatureToken),
  }),
);

export type Quote = typeof quotes.$inferSelect;
