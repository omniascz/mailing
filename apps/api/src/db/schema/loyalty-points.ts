/**
 * Loyalty points ledger (#236 — append-only transaction log)
 *
 * Source of truth for point balances. loyaltyMembers.pointBalance is a
 * cached snapshot; this table holds every individual credit/debit.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, varchar, integer,
  timestamp, index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { loyaltyMembers } from './loyalty-members.js';

export const loyaltyPointTxTypeEnum = pgEnum('loyalty_point_tx_type', [
  'earn',           // points credited (purchase, referral, etc.)
  'redeem',         // points debited for a reward
  'expire',         // points expired per program policy
  'adjust',         // manual admin correction
  'bonus',          // tier-up or one-off bonus
  'refund',         // reversal of a redemption
]);

export const loyaltyPoints = pgTable('loyalty_points', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => loyaltyMembers.id, { onDelete: 'cascade' }),

  type: loyaltyPointTxTypeEnum('type').notNull(),
  points: integer('points').notNull(), // positive = credit, negative = debit

  /** Running balance after this transaction */
  balanceAfter: integer('balance_after').notNull(),

  /** Human-readable reason / event name */
  description: varchar('description', { length: 255 }),

  /** Optional FK to order/campaign/event that caused this transaction */
  sourceRef: varchar('source_ref', { length: 255 }),

  /** Who triggered this (system, workflow, admin) */
  actorType: varchar('actor_type', { length: 50 }).notNull().default('system'),
  actorId: varchar('actor_id', { length: 255 }),

  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('loyalty_points_member_idx').on(t.memberId),
  index('loyalty_points_org_idx').on(t.orgId),
  index('loyalty_points_created_idx').on(t.memberId, t.createdAt),
]);

export type LoyaltyPointTx = typeof loyaltyPoints.$inferSelect;

/** Used in reward redemption context */
export interface RedeemPointsResult {
  success: boolean;
  txId?: string;
  newBalance?: number;
  reason?: string;
}
