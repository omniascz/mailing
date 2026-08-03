/**
 * Zero-party data engine — structured preferences explicitly provided by contacts.
 * Unlike behavioral data (first-party), zero-party data is self-declared.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const zpDataTypeEnum = pgEnum('zp_data_type', [
  'product_interest',
  'communication_frequency',
  'preferred_channel',
  'content_preference',
  'budget_range',
  'purchase_intent',
  'birthday',
  'anniversary',
  'location',
  'custom',
]);

/** Template for collecting zero-party data via email/form */
export const zpCollectionForms = pgTable(
  'zp_collection_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    /** Questions to ask — each maps to a zpDataType */
    questions: jsonb('questions')
      .$type<
        Array<{
          key: string;
          label: string;
          dataType: string;
          options?: string[];
          required?: boolean;
        }>
      >()
      .notNull()
      .default([]),
    active: boolean('active').notNull().default(true),
    /** URL to embed this form in email (AMP or fallback HTML) */
    embedToken: text('embed_token').notNull(),
    submissionCount: text('submission_count').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('zp_forms_org_idx').on(t.orgId),
    tokenIdx: uniqueIndex('zp_forms_token_idx').on(t.embedToken),
  }),
);

/** Stored zero-party preference per contact */
export const zpContactData = pgTable(
  'zp_contact_data',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    dataType: zpDataTypeEnum('data_type').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    source: text('source').notNull().default('form'), // 'form' | 'api' | 'import'
    formId: uuid('form_id'),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgContactIdx: index('zp_contact_data_contact_idx').on(t.orgId, t.contactId),
    contactKeyIdx: uniqueIndex('zp_contact_data_key_idx').on(t.orgId, t.contactId, t.key),
  }),
);

export type ZpCollectionForm = typeof zpCollectionForms.$inferSelect;
export type ZpContactDatum = typeof zpContactData.$inferSelect;
