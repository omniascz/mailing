/**
 * Loyalty programs schema (#234 — foundation for #235–#240)
 *
 * Supports multi-program per org (e.g. "VIP Club" + "Partner Program").
 * Each program has tiers (bronze/silver/gold/platinum), earning rules,
 * and an expiration policy.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const loyaltyPointExpiryTypeEnum = pgEnum('loyalty_point_expiry_type', [
  'never',
  'rolling', // points expire N days after they were earned
  'fixed', // points expire on a fixed annual date (e.g. Jan 1)
]);

export interface LoyaltyTier {
  id: string;
  name: string; // e.g. 'Bronze', 'Silver', 'Gold', 'Platinum'
  minPoints: number; // minimum cumulative points to reach this tier
  color?: string; // hex color for UI
  benefits?: string[]; // human-readable benefit descriptions
  multiplier?: number; // earning multiplier (e.g. 1.5 = 1.5× points)
}

export const loyaltyPrograms = pgTable(
  'loyalty_programs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    /** Ordered tiers from lowest to highest */
    tiers: jsonb('tiers').$type<LoyaltyTier[]>().notNull().default([]),

    /** Points expiry policy */
    expiryType: loyaltyPointExpiryTypeEnum('expiry_type').notNull().default('never'),
    /** For 'rolling': days; for 'fixed': MM-DD string (e.g. '01-01') */
    expiryValue: varchar('expiry_value', { length: 10 }),

    /** Allow members to earn points (disabled = view-only) */
    earningEnabled: boolean('earning_enabled').notNull().default(true),
    /** Allow members to redeem rewards */
    redemptionEnabled: boolean('redemption_enabled').notNull().default(true),

    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('loyalty_programs_org_idx').on(t.orgId)],
);

export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;
