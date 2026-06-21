/**
 * Consent graph — full timeline of every consent event per contact.
 * Enables GDPR Art. 7 proof-of-consent, consent version tracking, and DPA reporting.
 */
import {
  pgTable, uuid, text, timestamp, jsonb, index, pgEnum,
} from 'drizzle-orm/pg-core';

export const consentEventTypeEnum = pgEnum('consent_event_type', [
  'opt_in',             // initial subscribe
  'double_opt_in',      // confirmed via email link
  'opt_out',            // unsubscribe
  'preference_update',  // changed channels/topics
  'purpose_added',      // new GDPR purpose granted
  'purpose_removed',    // GDPR purpose revoked
  'consent_withdrawn',  // full GDPR Art. 17 erasure
  'data_export',        // Art. 15 SAR request
  're_consent',         // re-engagement consent renewal
]);

export const consentLegalBasisEnum = pgEnum('consent_legal_basis', [
  'consent',            // GDPR Art. 6(1)(a)
  'legitimate_interest',// GDPR Art. 6(1)(f)
  'contract',           // GDPR Art. 6(1)(b)
  'legal_obligation',   // GDPR Art. 6(1)(c)
]);

export const consentEvents = pgTable(
  'consent_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    eventType: consentEventTypeEnum('event_type').notNull(),
    legalBasis: consentLegalBasisEnum('legal_basis').notNull().default('consent'),
    channel: text('channel'), // 'email' | 'sms' | 'push' | 'whatsapp' | null (=all)
    purposeCode: text('purpose_code'), // e.g. 'marketing_email', 'profiling'
    consentVersion: text('consent_version'), // e.g. '2024-05-01'
    /** IP address at consent time (hashed for GDPR compliance) */
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    /** Source of consent: 'form', 'import', 'api', 'checkout', 'preference_center' */
    source: text('source').notNull().default('form'),
    /** URL of the form/page where consent was given */
    sourceUrl: text('source_url'),
    /** Raw proof: screenshot hash, form submission ID, etc. */
    proofPayload: jsonb('proof_payload'),
    /** Operator who manually changed consent (for admin overrides) */
    operatorId: uuid('operator_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contactIdx: index('consent_events_contact_idx').on(t.orgId, t.contactId),
    eventTypeIdx: index('consent_events_type_idx').on(t.orgId, t.eventType),
    occurredIdx: index('consent_events_occurred_idx').on(t.orgId, t.occurredAt),
  }),
);

export type ConsentEvent = typeof consentEvents.$inferSelect;
