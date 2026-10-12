/**
 * How many recipients an organisation has sent to in a billing period — what
 * the plan's monthly send limit is checked against (getPlanCapacity) and what
 * email is invoiced from (services/billing/meters.ts, Z137), read in one row
 * instead of counted from email_events on every send (Z136).
 *
 * Keyed by the organisation and the START of the period, so a new period is a
 * new row that starts from nothing; no job resets anything. The start is the
 * one plan_period_start(org) returns: the Stripe period start from
 * billing_subscriptions, else the first of the calendar month in UTC.
 *
 * Nothing in the application writes this table. A statement-level trigger on
 * email_events adds the non-sandboxed `send` rows each INSERT writes, in that
 * statement — and so in its transaction. A `send` row is one recipient, unique
 * per (org, message id, recipient), so a job that runs twice writes one row and
 * one send. The trigger, the functions and the backfills are in migrations
 * 0029 and 0030, which say why each is shaped as it is.
 *
 * Postgres, not Redis: this is what billing and the hard stop are decided on.
 * A Redis key that is evicted or lost with an instance reads as zero, and
 * nobody notices. Check it against email_events with
 * `pnpm --filter @forgemsg/api reconcile:plan-sends`.
 */
import { pgTable, uuid, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const planSendCounters = pgTable(
  'plan_send_counters',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    sends: integer('sends').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The primary key leads with org_id, so it is also the foreign key's index.
  (t) => [primaryKey({ columns: [t.orgId, t.periodStart] })],
);

export type PlanSendCounter = typeof planSendCounters.$inferSelect;
