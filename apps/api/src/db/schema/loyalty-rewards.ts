/**
 * Loyalty rewards catalog (#237)
 *
 * Rewards that members can redeem with their points.
 * Supports multiple reward types: discount, free product, external voucher.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { loyaltyPrograms } from './loyalty-programs.js';

export const loyaltyRewardTypeEnum = pgEnum('loyalty_reward_type', [
  'discount_pct',      // percentage off order
  'discount_fixed',    // fixed amount off order
  'free_product',      // free SKU added to cart
  'voucher',           // external gift card / promo code
  'experience',        // event/access/service
]);

export const loyaltyRewards = pgTable('loyalty_rewards', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  programId: uuid('program_id').notNull().references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),

  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: loyaltyRewardTypeEnum('type').notNull(),

  /** Points required to redeem */
  pointCost: integer('point_cost').notNull(),

  /** Type-specific config: { amount, sku, voucherPool, etc. } */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),

  /** Optional: only members in these tier IDs can redeem */
  requiredTierIds: jsonb('required_tier_ids').$type<string[]>().notNull().default([]),

  /** Total redemptions allowed (null = unlimited) */
  maxRedemptions: integer('max_redemptions'),
  /** Per-member limit */
  maxPerMember: integer('max_per_member'),
  /** How many times this has been redeemed so far */
  redemptionCount: integer('redemption_count').notNull().default(0),

  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('loyalty_rewards_org_program_idx').on(t.orgId, t.programId),
]);

export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;

// ── Redemption log ────────────────────────────────────────────────────────────

export const loyaltyRedemptions = pgTable('loyalty_redemptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  rewardId: uuid('reward_id').notNull().references(() => loyaltyRewards.id, { onDelete: 'restrict' }),
  memberId: uuid('member_id').notNull(),  // FK to loyalty_members — avoid circ dep

  pointsSpent: integer('points_spent').notNull(),

  /** Fulfilled voucher code or external reference */
  fulfillmentCode: varchar('fulfillment_code', { length: 255 }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('loyalty_redemptions_member_idx').on(t.memberId),
  index('loyalty_redemptions_reward_idx').on(t.rewardId),
]);

export type LoyaltyRedemption = typeof loyaltyRedemptions.$inferSelect;
