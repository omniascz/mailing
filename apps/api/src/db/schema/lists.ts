import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, integer, index, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    contactCount: integer('contact_count').notNull().default(0),
    doubleOptIn: integer('double_opt_in').notNull().default(0),
    confirmationEmailTemplate: varchar('confirmation_email_template', { length: 255 }),
    thankYouUrl: varchar('thank_you_url', { length: 1024 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('lists_org_id_idx').on(t.orgId)],
);

export const contactLists = pgTable(
  'contact_lists',
  {
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    // Sprint D.1 / D.9 — per-list opt-out (granular alternative to the global
    // suppressions row). When set, batch-sender filters this (contact,list)
    // pair out of broadcasts. The contact itself remains active for other
    // lists they're subscribed to.
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    unsubscribedReason: varchar('unsubscribed_reason', { length: 255 }),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.listId] }),
    index('contact_lists_list_id_idx').on(t.listId),
  ],
);

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ContactList = typeof contactLists.$inferSelect;
