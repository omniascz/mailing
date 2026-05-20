/**
 * Loyalty earning rules (#238)
 *
 * Rules that define how members earn points for various activities.
 * Evaluated by the earning-rules service when events are tracked.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { loyaltyPrograms } from './loyalty-programs.js';

export const loyaltyEarningEventEnum = pgEnum('loyalty_earning_event', [
  'purchase', // e-commerce order placed
  'signup', // member enrolled in program
  'birthday', // contact's birthday
  'referral', // referred a new contact
  'review', // submitted product review
  'social_share', // shared on social
  'profile_complete', // filled out profile fields
  'custom_event', // any custom event name
]);

export const loyaltyEarningRules = pgTable(
  'loyalty_earning_rules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    /** What event triggers point earning */
    eventType: loyaltyEarningEventEnum('event_type').notNull(),
    /** For custom_event: the event name to match */
    customEventName: varchar('custom_event_name', { length: 255 }),

    /** Fixed points per event (mutually exclusive with pointsPerCurrency) */
    pointsFixed: integer('points_fixed'),
    /** Points per currency unit (e.g. 1 point per $1 spent) */
    pointsPerCurrency: numeric('points_per_currency', { precision: 10, scale: 4 }),
    /** Currency field from event properties (e.g. 'amount', 'total') */
    currencyField: varchar('currency_field', { length: 100 }),

    /** Cap per single event (e.g. max 500 points per purchase) */
    maxPointsPerEvent: integer('max_points_per_event'),
    /** Cap per member lifetime */
    maxLifetimePoints: integer('max_lifetime_points'),
    /** Cap per rolling period (days) */
    maxPointsPerPeriod: integer('max_points_per_period'),
    periodDays: integer('period_days'),

    /** Optional extra conditions on event properties (JSONB path filter) */
    conditions: jsonb('conditions').$type<Record<string, unknown>>(),

    active: boolean('active').notNull().default(true),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('loyalty_earning_rules_org_program_idx').on(t.orgId, t.programId),
    index('loyalty_earning_rules_event_idx').on(t.programId, t.eventType),
  ],
);

export type LoyaltyEarningRule = typeof loyaltyEarningRules.$inferSelect;
