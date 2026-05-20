/**
 * Multi-product billing meters schema (#283).
 *
 * product_usage_meters — rolling monthly usage counters per org per product
 * product_meter_events — append-only event log for audit + reconciliation
 */

import { sql } from 'drizzle-orm';
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

/** Supported billable products */
export const METER_PRODUCTS = [
  'email',
  'sms',
  'whatsapp',
  'voice',
  'push',
  'in_app',
  'viber',
  'rcs',
  'ai_tokens',
  'loyalty',
] as const;

export type MeterProduct = (typeof METER_PRODUCTS)[number];

export const productUsageMeters = pgTable(
  'product_usage_meters',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Billable product */
    product: varchar('product', { length: 32 }).notNull(),

    /** Billing period (YYYY-MM) */
    period: varchar('period', { length: 7 }).notNull(),

    /** Units consumed this period */
    unitsUsed: integer('units_used').notNull().default(0),

    /** Billed cost in USD (computed at period end) */
    billedUsd: decimal('billed_usd', { precision: 10, scale: 4 }),

    /** Plan-included units (0 = overage-only billing) */
    includedUnits: integer('included_units').notNull().default(0),

    /** Rate per overage unit in USD */
    overageRateUsd: decimal('overage_rate_usd', { precision: 10, scale: 6 }).notNull().default('0'),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_meters_org_product_period_uq').on(t.orgId, t.product, t.period),
    index('product_meters_org_period_idx').on(t.orgId, t.period),
  ],
);

export const productMeterEvents = pgTable(
  'product_meter_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    product: varchar('product', { length: 32 }).notNull(),
    units: integer('units').notNull().default(1),
    referenceId: varchar('reference_id', { length: 255 }),
    referenceType: varchar('reference_type', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meter_events_org_product_idx').on(t.orgId, t.product, t.createdAt),
    index('meter_events_ref_idx').on(t.referenceId),
  ],
);

export type ProductUsageMeter = typeof productUsageMeters.$inferSelect;
export type ProductMeterEvent = typeof productMeterEvents.$inferSelect;
