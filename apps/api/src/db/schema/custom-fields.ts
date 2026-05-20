import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { customFieldTypeEnum } from './enums.js';

/**
 * Per-org custom field definitions.
 * Values are stored in contacts.custom_fields JSONB under the `key` field.
 */
export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** snake_case key used in contacts.custom_fields and segment queries (custom.<key>) */
    key: varchar('key', { length: 100 }).notNull(),
    fieldType: customFieldTypeEnum('field_type').notNull(),
    /** Valid options for 'select' type */
    options: jsonb('options').$type<string[]>(),
    required: boolean('required').notNull().default(false),
    defaultValue: varchar('default_value', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('custom_field_defs_org_key_idx').on(t.orgId, t.key)],
);

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type NewCustomFieldDefinition = typeof customFieldDefinitions.$inferInsert;
