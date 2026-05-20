/**
 * HIPAA compliance schema (#231)
 *
 * Tracks:
 *   - Per-org HIPAA mode flag (stored on organizations via settings, but also
 *     tracked here for audit history)
 *   - Business Associate Agreements (BAAs)
 *   - PHI field flags (which contact custom fields are tagged as PHI)
 *   - HIPAA access log (PHI access events for audit trail)
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const baaStatusEnum = pgEnum('baa_status', [
  'pending', // sent to vendor, awaiting signature
  'active', // signed and in effect
  'expired', // past the effective period
  'terminated', // explicitly terminated
]);

/** Business Associate Agreement record (HIPAA §164.308(b)) */
export const businessAssociateAgreements = pgTable(
  'business_associate_agreements',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Name of the Business Associate (vendor, sub-processor) */
    baName: varchar('ba_name', { length: 255 }).notNull(),
    baEmail: varchar('ba_email', { length: 255 }),
    baType: varchar('ba_type', { length: 100 }), // e.g. 'cloud-provider', 'analytics', 'email-delivery'

    status: baaStatusEnum('status').notNull().default('pending'),

    effectiveDate: timestamp('effective_date', { withTimezone: true }),
    expirationDate: timestamp('expiration_date', { withTimezone: true }),

    /** URL to the signed BAA document (internal MinIO or external URL) */
    documentUrl: varchar('document_url', { length: 1024 }),

    /** Who signed on behalf of the covered entity */
    signedByUserId: uuid('signed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    signedAt: timestamp('signed_at', { withTimezone: true }),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('baa_org_idx').on(t.orgId), index('baa_status_idx').on(t.orgId, t.status)],
);

/** Marks specific custom field keys as containing PHI */
export const phiFieldFlags = pgTable(
  'phi_field_flags',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** The custom field key (matches contacts.custom_fields JSONB key) */
    fieldKey: varchar('field_key', { length: 255 }).notNull(),

    /** PHI category (HIPAA §164.514 identifiers) */
    phiCategory: varchar('phi_category', { length: 100 }).notNull().default('other'),
    // Common categories: 'name', 'geographic', 'date', 'phone', 'fax', 'email',
    //   'ssn', 'mrn', 'health_plan_id', 'account_number', 'certificate',
    //   'vehicle_id', 'device_id', 'url', 'ip_address', 'biometric',
    //   'photo', 'other'

    /** Whether to encrypt this field at rest */
    encryptAtRest: boolean('encrypt_at_rest').notNull().default(false),

    /** Whether to redact this field in logs and export APIs */
    redactInLogs: boolean('redact_in_logs').notNull().default(true),

    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('phi_fields_org_idx').on(t.orgId)],
);

/** HIPAA access log for PHI access events (§164.312(b) — audit controls) */
export const hipaaAccessLog = pgTable(
  'hipaa_access_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    action: varchar('action', { length: 100 }).notNull(), // 'view', 'export', 'modify', 'delete'
    resource: varchar('resource', { length: 100 }).notNull(), // 'contact', 'custom_field', 'audit_log'
    resourceId: varchar('resource_id', { length: 255 }),

    /** Which PHI fields were accessed */
    phiFieldKeys: jsonb('phi_field_keys').$type<string[]>().notNull().default([]),

    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),

    /** Immutable — no updatedAt */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('hipaa_log_org_idx').on(t.orgId),
    index('hipaa_log_created_idx').on(t.orgId, t.createdAt),
    index('hipaa_log_user_idx').on(t.orgId, t.userId),
  ],
);

export type BusinessAssociateAgreement = typeof businessAssociateAgreements.$inferSelect;
export type PhiFieldFlag = typeof phiFieldFlags.$inferSelect;
export type HipaaAccessLog = typeof hipaaAccessLog.$inferSelect;
