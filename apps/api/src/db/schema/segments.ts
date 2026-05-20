import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// Serialized shape of the segment condition tree.
// Kept as jsonb so the query builder can evolve without migrations.
export type SegmentOperator = 'AND' | 'OR';
export type SegmentRuleOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'is_set'
  | 'is_not_set'
  | 'has_tag'
  | 'not_has_tag'
  | 'opened_campaign'
  | 'not_opened_campaign'
  | 'clicked_link'
  | 'not_clicked_link';

export interface SegmentRule {
  field: string;
  op: SegmentRuleOp;
  value?: unknown;
  withinDays?: number;
}

export interface SegmentConditions {
  operator: SegmentOperator;
  rules: SegmentRule[];
  groups?: SegmentConditions[];
  negate?: boolean;
}

export const segments = pgTable(
  'segments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    conditions: jsonb('conditions').$type<SegmentConditions>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('segments_org_id_idx').on(t.orgId)],
);

export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
