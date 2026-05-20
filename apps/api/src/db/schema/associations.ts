/**
 * Generic M:N associations (#320).
 *
 * Links any two entity types by (entity_type, entity_id) pairs:
 *   contact ↔ company
 *   contact ↔ deal
 *   deal ↔ account
 *   contact ↔ ticket
 *   custom_object ↔ any
 *
 * Both sides are stored once; queries walk from either side. Pair order is
 * normalised (lexicographic) so a given pair has exactly one row.
 */

import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export type AssociationEntityType =
  | 'contact'
  | 'company'
  | 'account'
  | 'deal'
  | 'ticket'
  | 'quote'
  | 'invoice'
  | 'custom_object'
  | 'task'
  | 'note'
  | 'meeting';

export const associations = pgTable(
  'associations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    fromType: varchar('from_type', { length: 32 }).notNull(),
    fromId: uuid('from_id').notNull(),

    toType: varchar('to_type', { length: 32 }).notNull(),
    toId: uuid('to_id').notNull(),

    /** e.g. 'primary_contact', 'decision_maker', 'billing_contact' */
    label: varchar('label', { length: 64 }),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('associations_pair_uq').on(
      t.orgId,
      t.fromType,
      t.fromId,
      t.toType,
      t.toId,
      t.label,
    ),
    index('associations_from_idx').on(t.orgId, t.fromType, t.fromId),
    index('associations_to_idx').on(t.orgId, t.toType, t.toId),
  ],
);

export type Association = typeof associations.$inferSelect;
export type NewAssociation = typeof associations.$inferInsert;
