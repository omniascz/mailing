/**
 * SMS-related schema: provider routes, send log, consents (tasks 7.3 + 7.5).
 */

import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── SMS provider routes (7.3) ────────────────────────────────────────────────

/**
 * sms_routes defines which SMS provider to use for a given country code,
 * in priority order. The routing engine picks the highest-priority active
 * route and falls over to the next on failure.
 */
export const smsRoutes = pgTable(
  'sms_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** ISO 3166-1 alpha-2 country code, or '*' for catch-all */
    countryCode: text('country_code').notNull(),
    /** Provider identifier: 'bulkgate' | 'twilio' */
    provider: text('provider').notNull(),
    /** Lower number = higher priority (1 = primary, 2 = secondary, …) */
    priority: integer('priority').notNull().default(1),
    active: boolean('active').notNull().default(true),
    /** Estimated cost per SMS segment in EUR */
    costPerSms: numeric('cost_per_sms', { precision: 10, scale: 6 }),
    /** Provider-specific config (credentials, from number, etc.) */
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCountryProviderIdx: index('sms_routes_org_country_idx').on(t.orgId, t.countryCode),
    orgProviderPriorityIdx: index('sms_routes_priority_idx').on(t.orgId, t.countryCode, t.priority),
  }),
);

// ─── SMS send log (7.3 cost tracking) ────────────────────────────────────────

export const smsSendLog = pgTable(
  'sms_send_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id'),
    phone: text('phone').notNull(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    /** 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' */
    status: text('status').notNull().default('queued'),
    segments: integer('segments').notNull().default(1),
    costEur: numeric('cost_eur', { precision: 10, scale: 6 }),
    campaignId: uuid('campaign_id'),
    workflowId: uuid('workflow_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('sms_send_log_org_idx').on(t.orgId),
    contactIdx: index('sms_send_log_contact_idx').on(t.contactId),
    providerMsgIdx: index('sms_send_log_provider_msg_idx').on(t.providerMessageId),
  }),
);

// ─── SMS consents (7.5 compliance) ───────────────────────────────────────────

/**
 * sms_consents tracks opt-in consent per phone number per org.
 * Required for TCPA (US) and GDPR (EU) compliance.
 */
export const smsConsents = pgTable(
  'sms_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** Normalized E.164 phone number */
    phone: text('phone').notNull(),
    contactId: uuid('contact_id'),
    /** How consent was obtained: 'web_form' | 'sms_keyword' | 'api' | 'import' */
    consentSource: text('consent_source').notNull(),
    /** IP address or context where consent was captured */
    consentContext: text('consent_context'),
    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when contact opts out */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** STOP | UNSUBSCRIBE | QUIT | CANCEL | END | OPTOUT */
    revokedViaKeyword: text('revoked_via_keyword'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPhoneIdx: uniqueIndex('sms_consents_org_phone_idx').on(t.orgId, t.phone),
    orgContactIdx: index('sms_consents_org_contact_idx').on(t.orgId, t.contactId),
  }),
);

// ─── SMS inbound messages (7.4) ───────────────────────────────────────────────

export const smsInbound = pgTable(
  'sms_inbound',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    fromPhone: text('from_phone').notNull(),
    toPhone: text('to_phone').notNull(),
    body: text('body').notNull(),
    contactId: uuid('contact_id'),
    /** Detected keyword action: 'stop' | 'help' | 'start' | 'custom' | null */
    keywordAction: text('keyword_action'),
    /** Whether the message triggered a workflow */
    workflowTriggered: boolean('workflow_triggered').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('sms_inbound_org_idx').on(t.orgId),
    fromPhoneIdx: index('sms_inbound_from_phone_idx').on(t.fromPhone),
    providerMsgIdx: index('sms_inbound_provider_msg_idx').on(t.providerMessageId),
  }),
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type SmsRoute = typeof smsRoutes.$inferSelect;
export type NewSmsRoute = typeof smsRoutes.$inferInsert;
export type SmsConsent = typeof smsConsents.$inferSelect;
export type NewSmsConsent = typeof smsConsents.$inferInsert;
export type SmsInbound = typeof smsInbound.$inferSelect;
export type SmsSendLog = typeof smsSendLog.$inferSelect;
