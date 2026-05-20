import {
  pgTable,
  uuid,
  varchar,
  decimal,
  boolean,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const holdoutGroups = pgTable(
  'holdout_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1024 }),
    percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull().default('5'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('holdout_groups_org_idx').on(t.orgId)],
);

export const holdoutGroupMembers = pgTable(
  'holdout_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => holdoutGroups.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.contactId] }),
    index('holdout_members_contact_idx').on(t.contactId),
  ],
);

export type HoldoutGroup = typeof holdoutGroups.$inferSelect;
export type HoldoutGroupMember = typeof holdoutGroupMembers.$inferSelect;
