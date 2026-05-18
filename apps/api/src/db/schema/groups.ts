import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

/**
 * Interest groups — dedicated "Mailchimp-style" grouping separate from tags.
 * Groups are organised into group_categories (e.g. "Preferred channels" → [Email, SMS, Push]).
 */
export const groupCategories = pgTable(
  'group_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull().default('checkboxes'), // checkboxes | radio | dropdown | hidden
    visible: boolean('visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_categories_org_idx').on(t.orgId)],
);

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => groupCategories.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('groups_category_idx').on(t.categoryId)],
);

export const contactGroups = pgTable(
  'contact_groups',
  {
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contact_groups_pk').on(t.contactId, t.groupId),
    index('contact_groups_group_idx').on(t.groupId),
  ],
);

export type GroupCategory = typeof groupCategories.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type ContactGroup = typeof contactGroups.$inferSelect;
