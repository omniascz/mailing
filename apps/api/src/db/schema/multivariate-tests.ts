import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const mvTestStatusEnum = pgEnum('mv_test_status', [
  'draft',
  'running',
  'selecting_winner',
  'winner_selected',
  'completed',
  'cancelled',
]);

export const mvWinnerMetricEnum = pgEnum('mv_winner_metric', [
  'open_rate',
  'click_rate',
  'click_to_open_rate',
  'conversion_rate',
  'revenue_per_email',
]);

export const mvVariantElementEnum = pgEnum('mv_variant_element', [
  'subject',
  'preheader',
  'from_name',
  'content',
  'send_time',
]);

// ─── Multivariate Tests ───────────────────────────────────────────────────────

/**
 * A multivariate test runs 3+ simultaneous variants of a campaign.
 * Unlike simple A/B (stored in campaigns.ab_config), MVT tracks each dimension
 * independently and picks a winner per configured metric after a test window.
 */
export const multivariateTests = pgTable(
  'multivariate_tests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Parent campaign that spawns the variants */
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    status: mvTestStatusEnum('status').notNull().default('draft'),

    /**
     * Which metric determines the winner.
     * Applies at the end of the test_window_hours.
     */
    winnerMetric: mvWinnerMetricEnum('winner_metric').notNull().default('open_rate'),

    /**
     * Percentage of audience to use for testing (rest gets winner variant).
     * E.g. 30 means 30% split across variants, 70% gets winning variant after window.
     */
    testAudiencePercent: integer('test_audience_percent').notNull().default(30),

    /** How long (hours) to run the test before picking a winner */
    testWindowHours: integer('test_window_hours').notNull().default(4),

    /** When the test window closes and winner is selected */
    winnerSelectAt: timestamp('winner_select_at', { withTimezone: true }),

    /** UUID of the winning variant once resolved */
    winnerVariantId: uuid('winner_variant_id'),

    /** Whether to automatically send the winner to the remaining audience */
    autoSendWinner: boolean('auto_send_winner').notNull().default(true),

    /** Minimum confidence level (%) required to declare a winner; 0 = first place wins */
    confidenceThreshold: decimal('confidence_threshold', { precision: 5, scale: 2 })
      .notNull()
      .default('95'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mv_tests_org_idx').on(t.orgId),
    index('mv_tests_campaign_idx').on(t.campaignId),
    index('mv_tests_status_idx').on(t.status),
  ],
);

// ─── Variants ─────────────────────────────────────────────────────────────────

/**
 * One row per variant (including the control). A test must have at least 2 variants
 * (control + one treatment). Recommended: 2-8 variants to maintain statistical power.
 */
export const mvTestVariants = pgTable(
  'mv_test_variants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    testId: uuid('test_id')
      .notNull()
      .references(() => multivariateTests.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Human-readable label, e.g. "Subject A", "Control", "Variant B" */
    name: varchar('name', { length: 100 }).notNull(),

    /** Whether this variant is the control (original). Only one per test. */
    isControl: boolean('is_control').notNull().default(false),

    /**
     * Which campaign element this variant modifies.
     * Multiple variants may test different elements (factorial design).
     */
    element: mvVariantElementEnum('element').notNull().default('subject'),

    /** Element-specific value. For 'subject': string. For 'content': block JSON. */
    value: jsonb('value').$type<Record<string, unknown> | string>().notNull(),

    /** Percentage of test audience allocated to this variant (must sum to 100 across test) */
    allocationPercent: decimal('allocation_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('50'),

    // ─── Live stats (denormalized from ClickHouse) ────────────────────────────
    totalSent: integer('total_sent').notNull().default(0),
    totalDelivered: integer('total_delivered').notNull().default(0),
    totalOpens: integer('total_opens').notNull().default(0),
    uniqueOpens: integer('unique_opens').notNull().default(0),
    totalClicks: integer('total_clicks').notNull().default(0),
    uniqueClicks: integer('unique_clicks').notNull().default(0),
    totalConversions: integer('total_conversions').notNull().default(0),
    totalRevenue: decimal('total_revenue', { precision: 12, scale: 2 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mv_variants_test_idx').on(t.testId),
    index('mv_variants_org_idx').on(t.orgId),
  ],
);

// ─── Contact-Variant assignments ──────────────────────────────────────────────

/**
 * Maps each contact to their assigned variant for reproducible deterministic
 * assignment (same contact always gets the same variant in repeated opens).
 */
export const mvVariantAssignments = pgTable(
  'mv_variant_assignments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    testId: uuid('test_id')
      .notNull()
      .references(() => multivariateTests.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => mvTestVariants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mv_assignments_test_contact_idx').on(t.testId, t.contactId),
    index('mv_assignments_variant_idx').on(t.variantId),
  ],
);

export type MultivariateTest = typeof multivariateTests.$inferSelect;
export type NewMultivariateTest = typeof multivariateTests.$inferInsert;
export type MvTestVariant = typeof mvTestVariants.$inferSelect;
export type NewMvTestVariant = typeof mvTestVariants.$inferInsert;
export type MvVariantAssignment = typeof mvVariantAssignments.$inferSelect;
