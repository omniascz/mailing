import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,

  jsonb,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

// ─── Lead score rules ─────────────────────────────────────────────────────────

/**
 * Per-org rules that define how events affect the lead score.
 * Default rules are seeded when an org activates lead scoring.
 *
 * Default values:
 *   email_open      +1  decay 90d
 *   email_click     +3  decay 90d
 *   link_click      +5  decay 90d
 *   page_visit      +2  decay 90d
 *   form_submit    +10  decay 180d
 *   purchase       +20  decay 365d
 */
export const leadScoreRules = pgTable(
  'lead_score_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    eventType: varchar('event_type', { length: 100 }).notNull(),
    points: integer('points').notNull(),           // positive = add, negative = subtract
    decayDays: integer('decay_days').notNull().default(90), // days until score contribution decays to 0
    active: boolean('active').notNull().default(true),
    description: varchar('description', { length: 255 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lead_score_rules_org_id_idx').on(t.orgId),
    index('lead_score_rules_event_type_idx').on(t.eventType),
  ],
);

// ─── Lead score events (audit log) ───────────────────────────────────────────

export const leadScoreEvents = pgTable(
  'lead_score_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),

    eventType: varchar('event_type', { length: 100 }).notNull(),
    pointsDelta: integer('points_delta').notNull(),
    scoreAfter: integer('score_after').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lead_score_events_contact_id_idx').on(t.contactId),
    index('lead_score_events_org_id_idx').on(t.orgId),
    index('lead_score_events_created_at_idx').on(t.createdAt),
  ],
);

export type LeadScoreRule = typeof leadScoreRules.$inferSelect;
export type NewLeadScoreRule = typeof leadScoreRules.$inferInsert;
export type LeadScoreEvent = typeof leadScoreEvents.$inferSelect;
