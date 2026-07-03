import { sql } from 'drizzle-orm'; // needed for gen_random_uuid() default
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Sending domains — one per customer domain (e.g. mail.acme.cz).
 *
 * Each domain owns its own DKIM key pair (stored here), SPF/DMARC records,
 * and tracks verification state for each DNS record type.
 */
export const sendingDomains = pgTable(
  'sending_domains',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Customer-owned domain used in From / Return-Path */
    domain: varchar('domain', { length: 253 }).notNull(),
    /** Subdomain used for tracking & Return-Path (default: mail.{domain}) */
    mailSubdomain: varchar('mail_subdomain', { length: 253 }),

    // ─── DKIM ──────────────────────────────────────────────────────────────────
    /** DKIM selector — default "fm1", rotated to "fm2" etc. on key rotation */
    dkimSelector: varchar('dkim_selector', { length: 63 }).notNull().default('fm1'),
    /** PEM-encoded 2048-bit RSA private key (never exposed via API) */
    dkimPrivateKey: text('dkim_private_key'),
    /** Base64-encoded public key — put into DNS TXT record */
    dkimPublicKey: text('dkim_public_key'),
    /** DKIM key algorithm — 'rsa' (default) or 'ed25519' (RFC 8463). Drives the
     *  k= tag of the DNS record. */
    dkimKeyType: varchar('dkim_key_type', { length: 16 }).notNull().default('rsa'),
    dkimVerified: boolean('dkim_verified').notNull().default(false),
    dkimVerifiedAt: timestamp('dkim_verified_at', { withTimezone: true }),
    /** BYODKIM: the private key was imported by the customer (not platform-
     *  generated), so key-rotation must not clobber it without --force. */
    dkimByo: boolean('dkim_byo').notNull().default(false),

    // ─── SPF ───────────────────────────────────────────────────────────────────
    spfVerified: boolean('spf_verified').notNull().default(false),
    spfVerifiedAt: timestamp('spf_verified_at', { withTimezone: true }),

    // ─── DMARC ─────────────────────────────────────────────────────────────────
    dmarcVerified: boolean('dmarc_verified').notNull().default(false),
    dmarcVerifiedAt: timestamp('dmarc_verified_at', { withTimezone: true }),

    // ─── Return-Path / MX ──────────────────────────────────────────────────────
    returnPathVerified: boolean('return_path_verified').notNull().default(false),
    returnPathVerifiedAt: timestamp('return_path_verified_at', { withTimezone: true }),

    /** Domain is fully verified and safe to send from */
    isVerified: boolean('is_verified').notNull().default(false),
    /** Warmup status: 'cold' | 'warming' | 'warm' */
    warmupStatus: varchar('warmup_status', { length: 20 }).notNull().default('cold'),
    warmupStartedAt: timestamp('warmup_started_at', { withTimezone: true }),
    warmupCompletedAt: timestamp('warmup_completed_at', { withTimezone: true }),

    /**
     * Opt-in: expose a public sender-reputation badge for this domain (#440).
     * When true, GET /api/v1/public/reputation/:domain serves a coarse,
     * privacy-safe health summary + SVG badge for transparency.
     */
    publicBadgeEnabled: boolean('public_badge_enabled').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sending_domains_org_idx').on(t.orgId),
    uniqueIndex('sending_domains_org_domain_idx').on(t.orgId, t.domain),
  ],
);

export type SendingDomain = typeof sendingDomains.$inferSelect;
export type NewSendingDomain = typeof sendingDomains.$inferInsert;

// ─── IP warmup schedule ───────────────────────────────────────────────────────

/**
 * Tracks per-IP warmup progress for the MTA's sending IP pool.
 */
export const warmupIps = pgTable(
  'warmup_ips',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    /** Day of warmup (1 = first day), incremented daily */
    warmupDay: integer('warmup_day').notNull().default(0),
    /** Emails sent on this IP today */
    todaySent: integer('today_sent').notNull().default(0),
    /** Date of current warmup day (UTC date string YYYY-MM-DD) */
    currentDate: varchar('current_date', { length: 10 }).notNull().default(''),
    status: varchar('status', { length: 20 }).notNull().default('cold'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('warmup_ips_ip_idx').on(t.ipAddress),
    index('warmup_ips_org_idx').on(t.orgId),
  ],
);

export type WarmupIp = typeof warmupIps.$inferSelect;
