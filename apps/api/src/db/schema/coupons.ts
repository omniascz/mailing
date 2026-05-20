import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const couponBatches = pgTable(
  'coupon_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    codePrefix: varchar('code_prefix', { length: 32 }).notNull().default(''),
    discountType: varchar('discount_type', { length: 16 }).notNull().default('percent'),
    discountValue: decimal('discount_value', { precision: 10, scale: 2 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    totalCodes: integer('total_codes').notNull().default(0),
    redeemedCount: integer('redeemed_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('coupon_batches_org_idx').on(t.orgId)],
);

export const couponCodes = pgTable(
  'coupon_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => couponBatches.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    assignedTo: uuid('assigned_to').references(() => contacts.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    revenue: decimal('revenue', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_codes_org_code_uq').on(t.orgId, t.code),
    index('coupon_codes_batch_idx').on(t.batchId),
  ],
);

export type CouponBatch = typeof couponBatches.$inferSelect;
export type CouponCode = typeof couponCodes.$inferSelect;
