/**
 * Lifecycle stage auto-advance rules (#319).
 *
 * Example rule:
 *   "Advance contact from MQL → SQL when lead_score > 80 AND a meeting is booked"
 *
 * Rules are evaluated whenever a lifecycle-impacting event fires
 * (lead_score_changed, meeting_booked, tag_added, email_opened, form_submitted).
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar, boolean, integer, jsonb, timestamp, index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/** Condition = { field, operator, value } — ANDed together. */
export interface LifecycleRuleCondition {
  field: string;          // e.g. 'lead_score', 'has_tag', 'has_booked_meeting', 'custom.region'
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  value: string | number | boolean | null;
}

export const lifecycleRules = pgTable(
  'lifecycle_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    priority: integer('priority').notNull().default(100), // lower = runs first

    /** Target lifecycle stage the rule advances a contact INTO */
    fromStage: varchar('from_stage', { length: 64 }),     // null = any stage
    toStage: varchar('to_stage', { length: 64 }).notNull(),

    /** JSON array of LifecycleRuleCondition */
    conditions: jsonb('conditions').$type<LifecycleRuleCondition[]>().notNull().default([]),

    /** Optional side effects */
    addTags: jsonb('add_tags').$type<string[]>().notNull().default([]),
    triggerWorkflowId: uuid('trigger_workflow_id'),

    /** Stats */
    evaluationCount: integer('evaluation_count').notNull().default(0),
    matchCount: integer('match_count').notNull().default(0),
    lastMatchedAt: timestamp('last_matched_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lifecycle_rules_org_idx').on(t.orgId),
    index('lifecycle_rules_enabled_idx').on(t.orgId, t.enabled),
  ],
);

export type LifecycleRule = typeof lifecycleRules.$inferSelect;
export type NewLifecycleRule = typeof lifecycleRules.$inferInsert;
