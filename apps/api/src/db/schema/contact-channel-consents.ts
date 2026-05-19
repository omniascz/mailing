/**
 * Per-channel consent audit table (Sprint D.4).
 *
 * One row per (contact, channel) — the row's optedIn flag is the
 * authoritative answer to "may we contact this person on channel X?".
 * Existing channel-specific tables (contact_emails.consent, sms_consents,
 * whatsapp opt-in) stay for their channel-specific details (multi-email
 * primary flag, TCPA STOP keywords, WhatsApp template approval state).
 * This table is the unified GDPR audit ledger across all channels.
 *
 * Flow:
 *   - First opt-in (e.g. form submit) → INSERT with optedIn=true,
 *     consentedAt=now, source='web_form', consentText snapshot.
 *   - Revoke (e.g. preference center unsubscribe) → UPDATE same row
 *     to optedIn=false, revokedAt=now, revokeReason='preference_center'.
 *   - Re-opt-in → UPDATE to optedIn=true, consentedAt=now (new ISO),
 *     revokedAt=null, consentText updated to current policy.
 *
 * Why one row per (contact, channel) instead of append-only history:
 *   - Hot-path read is "is this contact opted in on email RIGHT NOW?"
 *   - Append-only is O(N) per check; row-per-pair is O(1) by composite PK
 *   - Full history lives in audit_logs (Sonnet #496) — we don't duplicate
 *     it here. revokedAt + consentedAt cover the last transition.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

/**
 * Channels we currently model. Matches the IChannelAdapter set in
 * @forgemsg/shared (email/sms/whatsapp/push/voice/in_app/viber/
 * instagram/messenger) plus a 'tracking' pseudo-channel for ePrivacy
 * cookie-style opt-in (Sprint D.8).
 */
export const contactChannelConsents = pgTable(
  'contact_channel_consents',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    /**
     * String column (not enum) so adding a new channel doesn't require
     * a migration. Worker/service layers validate against the
     * IChannelAdapter set at runtime.
     */
    channel: varchar('channel', { length: 32 }).notNull(),

    optedIn: boolean('opted_in').notNull().default(false),

    /** Free-form source label: 'web_form' | 'api' | 'import' | 'preference_center' | 'admin' | … */
    source: varchar('source', { length: 64 }).notNull(),
    /**
     * Plain-text snapshot of the consent statement the user agreed to.
     * Auditors expect the literal text — link rot kills paper trails.
     */
    consentText: text('consent_text'),

    /** IP captured at consent moment (null when consent came over API). */
    ipAddress: varchar('ip_address', { length: 45 }),
    /** User-agent at consent moment (null when consent came over API). */
    userAgent: varchar('user_agent', { length: 1024 }),

    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
    /** When the most recent revoke happened. NULL means still active. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Free-form revoke reason — 'preference_center', 'list-unsubscribe', 'admin', … */
    revokeReason: varchar('revoke_reason', { length: 255 }),

    /** Source platform name when consent was imported (Klaviyo, Ecomail, …). */
    importedFrom: varchar('imported_from', { length: 64 }),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.channel] }),
    index('contact_channel_consents_org_idx').on(t.orgId),
    index('contact_channel_consents_channel_idx').on(t.channel),
    index('contact_channel_consents_opted_in_idx').on(t.optedIn),
  ],
);

export type ContactChannelConsent = typeof contactChannelConsents.$inferSelect;
export type NewContactChannelConsent = typeof contactChannelConsents.$inferInsert;
