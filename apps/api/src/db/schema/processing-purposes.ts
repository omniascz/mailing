/**
 * GDPR processing purposes — granular per-purpose consent management.
 *
 * Org defines processing purposes (e.g., "Marketing emails", "Analytics",
 * "Profiling"), each with a legal basis and optional retention window.
 * Contacts grant/revoke consent per purpose independently of channel consent.
 *
 * Two tables:
 *  1. processing_purposes    — org-level purpose definitions
 *  2. contact_gdpr_consents  — per-contact per-purpose consent records
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

// ─── Legal bases defined in GDPR Art. 6 ─────────────────────────────────────
export const GDPR_LEGAL_BASES = [
  'consent', // Art. 6(1)(a) — explicit, withdrawable
  'contract', // Art. 6(1)(b)
  'legal_obligation', // Art. 6(1)(c)
  'vital_interests', // Art. 6(1)(d)
  'public_task', // Art. 6(1)(e)
  'legitimate_interest', // Art. 6(1)(f) — soft opt-out
] as const;

export type GdprLegalBasis = (typeof GDPR_LEGAL_BASES)[number];

export const processingPurposes = pgTable(
  'processing_purposes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Internal slug — stable identifier for code references */
    slug: varchar('slug', { length: 80 }).notNull(),
    /** Human-readable name shown to contacts on consent forms */
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    legalBasis: varchar('legal_basis', { length: 30 }).notNull().default('consent'),
    /** How long (days) we retain data processed for this purpose. NULL = indefinite */
    retentionDays: integer('retention_days'),
    /** Soft-delete: archived purposes stop appearing on new consent forms */
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('processing_purposes_org_slug_uq').on(t.orgId, t.slug),
    index('processing_purposes_org_idx').on(t.orgId),
  ],
);

export const contactGdprConsents = pgTable(
  'contact_gdpr_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    purposeId: uuid('purpose_id')
      .notNull()
      .references(() => processingPurposes.id, { onDelete: 'cascade' }),
    /** true = granted, false = explicitly refused */
    granted: boolean('granted').notNull(),
    /** Source of consent (web_form, import, api, backfill, etc.) */
    source: varchar('source', { length: 64 }).notNull(),
    /** Verbatim consent wording shown to user at collection time */
    consentText: text('consent_text'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 1024 }),
    /** When consent was granted/recorded */
    grantedAt: timestamp('granted_at', { withTimezone: true }),
    /** Calculated expiry: grantedAt + purpose.retention_days */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** When consent was explicitly withdrawn (NULL if still active) */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One active consent record per contact per purpose.
    // When a contact regrants or revokes, INSERT a new row (full audit trail).
    index('contact_gdpr_consents_contact_purpose_idx').on(t.contactId, t.purposeId),
    index('contact_gdpr_consents_org_purpose_idx').on(t.orgId, t.purposeId),
    index('contact_gdpr_consents_expires_idx').on(t.expiresAt),
  ],
);

export type ProcessingPurpose = typeof processingPurposes.$inferSelect;
export type NewProcessingPurpose = typeof processingPurposes.$inferInsert;
export type ContactGdprConsent = typeof contactGdprConsents.$inferSelect;
export type NewContactGdprConsent = typeof contactGdprConsents.$inferInsert;
