import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  decimal,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

/**
 * Contacts held back from the initial variant sends for simple A/B campaigns.
 * The splitter populates this table when ab_config.variants sum to < 100%.
 * The remaining (holdback) slice is dispatched to the winning variant after
 * the test window (testDurationHours) elapses.
 */
export const abTestHoldbacks = pgTable(
  'ab_test_holdbacks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ab_holdbacks_campaign_contact_uidx').on(t.campaignId, t.contactId),
    index('ab_holdbacks_campaign_idx').on(t.campaignId),
    index('ab_holdbacks_org_idx').on(t.orgId),
  ],
);

/**
 * Summary of a completed A/B test — one row per campaign.
 * Written by the ab-winner worker after winner is dispatched (or skipped).
 */
export const abTestResults = pgTable(
  'ab_test_results',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** id of the winning AbVariant (from ab_config.variants[].id) */
    winnerVariantId: varchar('winner_variant_id', { length: 100 }).notNull(),
    /**
     * The metric this test was decided on. Always written explicitly by
     * computeAbWinner; the column default exists only so the NOT NULL holds for
     * rows written before it. It is deliberately NOT the product default —
     * that lives in one place, DEFAULT_WINNER_CRITERIA in ab-winner.ts, and a
     * second copy here would drift the moment one of them changed.
     */
    winnerMetric: varchar('winner_metric', { length: 50 }).notNull().default('click_rate'),
    winnerScore: decimal('winner_score', { precision: 10, scale: 6 }).notNull().default('0'),
    runnerUpScore: decimal('runner_up_score', { precision: 10, scale: 6 }).notNull().default('0'),
    /** Statistical confidence of the winner over runner-up, 0–100. */
    confidencePct: decimal('confidence_pct', { precision: 5, scale: 2 }),
    holdbackCount: integer('holdback_count').notNull().default(0),
    /** True once the winner variant has been dispatched to the holdback slice. */
    autoSendDispatched: boolean('auto_send_dispatched').notNull().default(false),
    /**
     * What computeAbWinner decided: 'auto_send' or 'needs_review'.
     *
     * `confidenceThreshold` on ab_config was declared, documented and read by
     * nothing, so an inconclusive test dispatched its winner exactly like a
     * decisive one. Below the threshold the decision is now 'needs_review', the
     * holdback stays unsent and the campaign is paused for a human.
     */
    decision: varchar('decision', { length: 32 }).notNull().default('auto_send'),
    /** Customer-facing sentence explaining a 'needs_review' decision. */
    decisionReason: varchar('decision_reason', { length: 500 }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    selectedAt: timestamp('selected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ab_results_campaign_uidx').on(t.campaignId),
    index('ab_results_org_idx').on(t.orgId),
  ],
);

export type AbTestHoldback = typeof abTestHoldbacks.$inferSelect;
export type AbTestResult = typeof abTestResults.$inferSelect;
