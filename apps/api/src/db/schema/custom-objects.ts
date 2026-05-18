import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Custom object framework — lets each org model arbitrary domain entities
 * (e.g., Property, Vehicle, Subscription) without schema changes.
 *
 * - `customObjectDefinitions` describes the entity type (a JSON schema of fields).
 * - `customObjectRecords` stores instances; values live in JSONB validated against the def.
 * - `customObjectRelations` links a record to a built-in entity (contact/account/deal).
 */

export interface CustomObjectField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'reference';
  required?: boolean;
  options?: string[];
  /** When type=='reference', what entity it points to. */
  referenceTo?: 'contact' | 'account' | 'deal' | 'custom';
  /** When referenceTo=='custom', which custom object key. */
  referenceCustomKey?: string;
  defaultValue?: unknown;
}

export const customObjectDefinitions = pgTable(
  'custom_object_definitions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 64 }).notNull(),
    singularLabel: text('singular_label').notNull(),
    pluralLabel: text('plural_label').notNull(),
    description: text('description'),
    fields: jsonb('fields').$type<CustomObjectField[]>().notNull().default(sql`'[]'::jsonb`),
    /** Field key whose value uniquely identifies a record (used for upserts). */
    primaryFieldKey: varchar('primary_field_key', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('custom_object_defs_org_key_idx').on(t.orgId, t.key)],
);

export const customObjectRecords = pgTable(
  'custom_object_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    objectDefId: uuid('object_def_id').notNull().references(() => customObjectDefinitions.id, { onDelete: 'cascade' }),
    objectKey: varchar('object_key', { length: 64 }).notNull(),
    /** Optional client-provided external id (e.g., from CRM) — supports idempotent upsert. */
    externalId: varchar('external_id', { length: 255 }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('custom_object_records_org_idx').on(t.orgId),
    index('custom_object_records_def_idx').on(t.objectDefId),
    uniqueIndex('custom_object_records_external_idx').on(t.orgId, t.objectKey, t.externalId),
  ],
);

export const customObjectRelations = pgTable(
  'custom_object_relations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    recordId: uuid('record_id').notNull().references(() => customObjectRecords.id, { onDelete: 'cascade' }),
    /** Entity type: 'contact' | 'account' | 'deal' | 'custom'. */
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    /** When entityType='custom', which definition key. */
    entityCustomKey: varchar('entity_custom_key', { length: 64 }),
    role: varchar('role', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('custom_object_rel_record_idx').on(t.recordId),
    index('custom_object_rel_entity_idx').on(t.orgId, t.entityType, t.entityId),
  ],
);

export type CustomObjectDefinition = typeof customObjectDefinitions.$inferSelect;
export type NewCustomObjectDefinition = typeof customObjectDefinitions.$inferInsert;
export type CustomObjectRecord = typeof customObjectRecords.$inferSelect;
export type NewCustomObjectRecord = typeof customObjectRecords.$inferInsert;
export type CustomObjectRelation = typeof customObjectRelations.$inferSelect;
export type NewCustomObjectRelation = typeof customObjectRelations.$inferInsert;
