import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, boolean, index, integer } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import {
  contactStatusEnum,
  phoneTypeEnum,
  phoneStatusEnum,
  lifecycleStageEnum,
} from './enums.js';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Identity
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),

    // Status
    status: contactStatusEnum('status').notNull().default('active'),

    // Lifecycle stage (#317/#394)
    lifecycleStage: lifecycleStageEnum('lifecycle_stage').notNull().default('subscriber'),
    lifecycleStageEnteredAt: timestamp('lifecycle_stage_entered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Custom fields (flexible per-org schema)
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),

    // Email validation (set by validation engine)
    emailValidationScore: varchar('email_validation_score', { length: 10 }),
    emailValidatedAt: timestamp('email_validated_at', { withTimezone: true }),

    // Phone intelligence — populated by prefix parser (cheap) + HLR lookup (expensive)
    phoneType: phoneTypeEnum('phone_type'),
    phoneStatus: phoneStatusEnum('phone_status'),
    phoneOperator: varchar('phone_operator', { length: 50 }),
    phoneRegion: varchar('phone_region', { length: 100 }),
    phoneDistrict: varchar('phone_district', { length: 100 }),
    phonePorted: boolean('phone_ported'),
    phoneRoaming: boolean('phone_roaming'),
    phoneCountry: varchar('phone_country', { length: 2 }),
    phoneLookupAt: timestamp('phone_lookup_at', { withTimezone: true }),

    // Engagement (denormalized for fast segmentation)
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    lastClickedAt: timestamp('last_clicked_at', { withTimezone: true }),
    leadScore: integer('lead_score').default(0),

    // Source tracking
    source: varchar('source', { length: 100 }),
    sourceDetails: jsonb('source_details').$type<Record<string, unknown>>(),

    // Preferred locale (ISO, e.g. 'en', 'cs', 'sk') — used to auto-select translations
    preferredLocale: varchar('preferred_locale', { length: 8 }),

    // Team ownership (#343) — NULL means org-wide (legacy or cross-team).
    teamId: uuid('team_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Org-scoped lookups
    index('contacts_org_id_idx').on(t.orgId),
    index('contacts_org_email_idx').on(t.orgId, t.email),
    index('contacts_org_phone_idx').on(t.orgId, t.phone),
    index('contacts_org_status_idx').on(t.orgId, t.status),

    // Phone intelligence segmentation
    index('contacts_phone_status_idx').on(t.phoneStatus),
    index('contacts_phone_operator_idx').on(t.phoneOperator),
    index('contacts_phone_district_idx').on(t.phoneDistrict),
    index('contacts_phone_lookup_at_idx').on(t.phoneLookupAt),

    // Engagement segmentation
    index('contacts_last_opened_idx').on(t.lastOpenedAt),
    index('contacts_last_clicked_idx').on(t.lastClickedAt),

    // Soft delete filter
    index('contacts_deleted_at_idx').on(t.deletedAt),

    // Lifecycle filtering
    index('contacts_lifecycle_stage_idx').on(t.orgId, t.lifecycleStage),
  ],
);

/** Lifecycle-stage transition history (#317/#394). */
export const lifecycleStageHistory = pgTable(
  'lifecycle_stage_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    fromStage: lifecycleStageEnum('from_stage'),
    toStage: lifecycleStageEnum('to_stage').notNull(),
    changedBy: uuid('changed_by'),
    reason: varchar('reason', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lifecycle_history_contact_idx').on(t.contactId, t.occurredAt),
    index('lifecycle_history_org_idx').on(t.orgId, t.occurredAt),
  ],
);

export type LifecycleStageHistory = typeof lifecycleStageHistory.$inferSelect;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
