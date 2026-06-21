import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export interface QuoteLineItemTemplate {
  sku?: string;
  name: string;
  description?: string;
  qty: number;
  unitPrice: number;
  discount?: number; // percent 0-100
}

/**
 * Reusable quote templates with default line items, notes, terms, and
 * optional Liquid/HTML body for PDF rendering.
 */
export const quoteTemplates = pgTable(
  'quote_templates',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    /** Pre-filled line items (can be overridden per quote) */
    defaultLineItems: jsonb('default_line_items')
      .$type<QuoteLineItemTemplate[]>()
      .notNull()
      .default([]),
    defaultCurrency: varchar('default_currency', { length: 3 }).notNull().default('CZK'),
    defaultNotes: text('default_notes'),
    defaultTerms: text('default_terms'),
    /** Optional Liquid HTML template for PDF rendering ({{quote.title}}, {{line_items}} etc.) */
    pdfHtmlTemplate: text('pdf_html_template'),
    /** Optional CSS for PDF styling */
    pdfCss: text('pdf_css'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quote_templates_org_idx').on(t.orgId)],
);

export type QuoteTemplate = typeof quoteTemplates.$inferSelect;
export type NewQuoteTemplate = typeof quoteTemplates.$inferInsert;
