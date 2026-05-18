/**
 * Loyalty members schema (#235)
 *
 * A member = one contact enrolled in one loyalty program.
 * One contact can be in multiple programs (one row per program).
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, varchar, integer, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { loyaltyPrograms } from './loyalty-programs.js';
import { contacts } from './contacts.js';

export const loyaltyMemberStatusEnum = pgEnum('loyalty_member_status', [
  'active',
  'suspended',
  'opted_out',
]);

export const loyaltyMembers = pgTable('loyalty_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  programId: uuid('program_id').notNull().references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),

  status: loyaltyMemberStatusEnum('status').notNull().default('active'),

  /** Current tier ID from program.tiers[] */
  currentTierId: varchar('current_tier_id', { length: 255 }),
  /** Cached point balance (source of truth is the ledger, but cached here for fast queries) */
  pointBalance: integer('point_balance').notNull().default(0),
  /** Lifetime points earned (for tier calculation — never decremented) */
  lifetimePoints: integer('lifetime_points').notNull().default(0),

  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('loyalty_members_org_idx').on(t.orgId),
  index('loyalty_members_program_idx').on(t.programId),
  index('loyalty_members_contact_idx').on(t.contactId),
  uniqueIndex('loyalty_members_program_contact_idx').on(t.programId, t.contactId),
]);

export type LoyaltyMember = typeof loyaltyMembers.$inferSelect;
