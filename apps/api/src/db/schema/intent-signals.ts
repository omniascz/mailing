import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const intentSignalTypeEnum = pgEnum('intent_signal_type', [
  // First-party (own tracking pixel)
  'pricing_page_visit',
  'case_study_view',
  'demo_request_page',
  'comparison_page',
  'product_page_visit',
  'content_download',
  'webinar_attended',
  // Third-party (Bombora / 6sense)
  'bombora_surge',
  'sixsense_intent',
  // Behavioral
  'job_posting_signal', // company is hiring in your domain
  'tech_stack_change', // they added/removed a competitor
  'funding_event', // company raised funding
  'executive_change', // new CXO hired
  // Engagement
  'email_click_buying_signal', // clicked pricing/demo link
  'chat_started',
  'trial_started',
]);

export const intentSignalSourceEnum = pgEnum('intent_signal_source', [
  'first_party', // own tracking pixel / form
  'bombora',
  '6sense',
  'clearbit',
  'manual',
]);

export const intentSignals = pgTable(
  'intent_signals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    /** Company domain (for account-level signals without a contact yet) */
    accountDomain: varchar('account_domain', { length: 255 }),
    signalType: intentSignalTypeEnum('signal_type').notNull(),
    source: intentSignalSourceEnum('source').notNull().default('first_party'),
    /** Intensity 0–100 */
    score: integer('score').notNull().default(50),
    /** URL or page that triggered the signal */
    sourceUrl: text('source_url'),
    /** Raw payload from the third-party provider */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('intent_signals_org_idx').on(t.orgId),
    index('intent_signals_contact_idx').on(t.contactId),
    index('intent_signals_domain_idx').on(t.orgId, t.accountDomain),
    index('intent_signals_type_idx').on(t.orgId, t.signalType),
    index('intent_signals_detected_idx').on(t.orgId, t.detectedAt),
  ],
);

/**
 * Aggregated intent score per account/contact — updated by a cron job that
 * rolls up signals into a single composite score.
 */
export const intentScores = pgTable(
  'intent_scores',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    accountDomain: varchar('account_domain', { length: 255 }),
    /** Composite intent score 0–100 */
    score: integer('score').notNull().default(0),
    /** Breakdown by signal type */
    breakdown: jsonb('breakdown').$type<Record<string, number>>().notNull().default({}),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('intent_scores_org_idx').on(t.orgId),
    index('intent_scores_contact_idx').on(t.contactId),
    index('intent_scores_domain_idx').on(t.orgId, t.accountDomain),
  ],
);

export type IntentSignal = typeof intentSignals.$inferSelect;
export type NewIntentSignal = typeof intentSignals.$inferInsert;
export type IntentScore = typeof intentScores.$inferSelect;
