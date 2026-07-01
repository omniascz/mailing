import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
    /**
     * When the materialized membership was last reconciled. NULL = never synced;
     * the first sync only baselines membership (no entered/exited triggers) so
     * existing members don't flood workflows.
     */
    lastMembershipSyncAt: timestamp('last_membership_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('segments_org_id_idx').on(t.orgId)],
);

export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;

/**
 * Materialized segment membership — enables real-time "entered/exited segment"
 * workflow triggers and fast audience resolution. Refreshed by the
 * segment-membership cron, which diffs the current on-read match against these
 * rows to detect entries/exits.
 */
export const segmentMembers = pgTable(
  'segment_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('segment_members_seg_contact_idx').on(t.segmentId, t.contactId),
    index('segment_members_org_seg_idx').on(t.orgId, t.segmentId),
  ],
);

export type SegmentMember = typeof segmentMembers.$inferSelect;
