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
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ipStatusEnum = pgEnum('dedicated_ip_status', [
  'pending',
  'provisioning',
  'active',
  'warming',
  'warm',
  'suspended',
  'retired',
]);

export const ipPoolTypeEnum = pgEnum('ip_pool_type', [
  'marketing',
  'transactional',
  'cold_outreach',
  'warming',
  'shared',
  'dedicated',
]);

// ─── IP Pools ─────────────────────────────────────────────────────────────────

/**
 * An IP pool groups dedicated IPs used for a specific traffic class.
 * Segregating mail streams (e.g. transactional vs marketing) protects
 * critical traffic from reputation issues on the marketing side.
 *
 * Each org may own multiple pools; one pool is marked as the default.
 */
export const ipPools = pgTable(
  'ip_pools',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    type: ipPoolTypeEnum('type').notNull().default('marketing'),

    /** Is this the default pool for this org's outgoing mail? */
    isDefault: boolean('is_default').notNull().default(false),

    /** Allow this pool to be used for a specific campaign type */
    allowedCampaignTypes: varchar('allowed_campaign_types', { length: 255 })
      .notNull()
      .default('email'),

    /**
     * Soft cap on per-IP daily volume in this pool (0 = no cap).
     * MTA uses this as a target — if exceeded, a new IP may be rotated in.
     */
    perIpDailyLimit: integer('per_ip_daily_limit').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('ip_pools_org_idx').on(t.orgId),
    uniqueIndex('ip_pools_org_name_idx').on(t.orgId, t.name),
  ],
);

// ─── Dedicated IPs ────────────────────────────────────────────────────────────

/**
 * A dedicated IP allocated to exactly one org (or unallocated / system pool).
 * Warmup, reputation and volume are tracked per IP.
 *
 * Engine reads this table when picking an outbound source IP for each message.
 */
export const dedicatedIps = pgTable(
  'dedicated_ips',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** IPv4 or IPv6 address */
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    /** PTR (reverse DNS) record — e.g. mta1.customer.forgemsg.com */
    ptrRecord: varchar('ptr_record', { length: 253 }),

    /** Org this IP is assigned to. NULL = unallocated / system pool. */
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),

    /** Pool this IP belongs to (optional — IP may sit idle before assignment) */
    poolId: uuid('pool_id').references(() => ipPools.id, { onDelete: 'set null' }),

    status: ipStatusEnum('status').notNull().default('pending'),

    // ─── Warmup ───────────────────────────────────────────────────────────────
    /** Day in the warmup schedule (1 = first day) */
    warmupDay: integer('warmup_day').notNull().default(0),
    /** Total emails sent during warmup */
    warmupSent: integer('warmup_sent').notNull().default(0),
    warmupStartedAt: timestamp('warmup_started_at', { withTimezone: true }),
    warmupCompletedAt: timestamp('warmup_completed_at', { withTimezone: true }),

    // ─── Volume & reputation ──────────────────────────────────────────────────
    /** Emails sent today (resets daily via maintenance job) */
    todaySent: integer('today_sent').notNull().default(0),
    /** Total lifetime sent from this IP */
    totalSent: integer('total_sent').notNull().default(0),

    /** Current reputation score 0–100 (derived from bounces, complaints, blacklists) */
    reputationScore: decimal('reputation_score', { precision: 5, scale: 2 }).notNull().default('0'),
    reputationUpdatedAt: timestamp('reputation_updated_at', { withTimezone: true }),

    /** Blacklist listings count (populated by reputation job) */
    blacklistCount: integer('blacklist_count').notNull().default(0),

    /** Recent bounce rate (%) over a rolling 24h window */
    bounceRate: decimal('bounce_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    /** Recent complaint rate (%) over a rolling 24h window */
    complaintRate: decimal('complaint_rate', { precision: 5, scale: 2 }).notNull().default('0'),

    /** Data-center region (for geo-aware routing / EU data residency) */
    region: varchar('region', { length: 20 }).notNull().default('us-east'),

    /** Free-form ops notes */
    notes: text('notes'),

    allocatedAt: timestamp('allocated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dedicated_ips_address_idx').on(t.ipAddress),
    index('dedicated_ips_org_idx').on(t.orgId),
    index('dedicated_ips_pool_idx').on(t.poolId),
    index('dedicated_ips_status_idx').on(t.status),
  ],
);

// ─── Warmup schedule templates ────────────────────────────────────────────────

/**
 * Daily volume caps during IP warmup.
 * Industry-standard 30-day ramp based on ReturnPath / Validity guidelines.
 * Stored per-pool so pools can define aggressive or conservative ramps.
 */
export const ipWarmupSchedules = pgTable(
  'ip_warmup_schedules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => ipPools.id, { onDelete: 'cascade' }),
    /** Day of warmup (1–30 typically) */
    day: integer('day').notNull(),
    /** Maximum emails allowed from a single IP on this day */
    maxVolume: integer('max_volume').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ip_warmup_schedules_pool_day_idx').on(t.poolId, t.day)],
);

export type IpPool = typeof ipPools.$inferSelect;
export type NewIpPool = typeof ipPools.$inferInsert;
export type DedicatedIp = typeof dedicatedIps.$inferSelect;
export type NewDedicatedIp = typeof dedicatedIps.$inferInsert;
export type IpWarmupSchedule = typeof ipWarmupSchedules.$inferSelect;
