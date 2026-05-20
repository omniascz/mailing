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
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const abuseSignalTypeEnum = pgEnum('abuse_signal_type', [
  'high_bounce_rate',
  'high_complaint_rate',
  'spam_trap_hit',
  'honeypot_hit',
  'volume_spike',
  'list_quality_low',
  'new_account_high_volume',
  'blacklist_hit',
  'content_spam_score',
  'suspicious_login',
  'api_abuse',
  'credential_stuffing',
  'stale_list_send',
]);

export const abuseSeverityEnum = pgEnum('abuse_severity', [
  'info',
  'low',
  'medium',
  'high',
  'critical',
]);

export const abuseActionEnum = pgEnum('abuse_action', [
  'none',
  'alert',
  'throttle',
  'pause_campaigns',
  'suspend_sending',
  'suspend_account',
  'require_review',
]);

export const abuseEventStatusEnum = pgEnum('abuse_event_status', [
  'open',
  'acknowledged',
  'investigating',
  'resolved',
  'false_positive',
]);

// ─── Rules ────────────────────────────────────────────────────────────────────

/**
 * Admin-configurable thresholds for automatic abuse detection.
 * Ships with default system rules; orgs may override per-plan on their own.
 */
export const abuseRules = pgTable(
  'abuse_rules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** NULL = global system rule; otherwise org-specific override */
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    signalType: abuseSignalTypeEnum('signal_type').notNull(),

    /** Threshold value that trips the rule. Semantics depend on signalType. */
    threshold: decimal('threshold', { precision: 12, scale: 4 }).notNull(),

    /** Observation window in minutes (e.g. "bounce rate > 5% over last 60min") */
    windowMinutes: integer('window_minutes').notNull().default(60),

    /** Minimum sample size before the rule fires (guard vs tiny N) */
    minSampleSize: integer('min_sample_size').notNull().default(100),

    severity: abuseSeverityEnum('severity').notNull().default('medium'),
    action: abuseActionEnum('action').notNull().default('alert'),

    enabled: boolean('enabled').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('abuse_rules_org_idx').on(t.orgId),
    index('abuse_rules_signal_idx').on(t.signalType),
    index('abuse_rules_enabled_idx').on(t.enabled),
  ],
);

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * An event is raised when a rule fires. Each event tracks what was observed,
 * what action was taken, and how it was resolved.
 */
export const abuseEvents = pgTable(
  'abuse_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Which rule fired. NULL if ad-hoc / admin-created. */
    ruleId: uuid('rule_id').references(() => abuseRules.id, { onDelete: 'set null' }),

    signalType: abuseSignalTypeEnum('signal_type').notNull(),
    severity: abuseSeverityEnum('severity').notNull(),

    /** Observed value that tripped the threshold */
    observedValue: decimal('observed_value', { precision: 12, scale: 4 }).notNull(),
    threshold: decimal('threshold', { precision: 12, scale: 4 }).notNull(),

    /** Sample size at the time of the event */
    sampleSize: integer('sample_size').notNull().default(0),

    /** Short human-readable message shown in admin UI */
    summary: varchar('summary', { length: 500 }).notNull(),
    /** Optional additional context: affected campaign, IP, source list, etc. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    /** Optional links to related entities */
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    ipAddress: varchar('ip_address', { length: 45 }),

    status: abuseEventStatusEnum('status').notNull().default('open'),
    actionTaken: abuseActionEnum('action_taken').notNull().default('none'),

    /** Admin who acknowledged / resolved */
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('abuse_events_org_idx').on(t.orgId),
    index('abuse_events_status_idx').on(t.status),
    index('abuse_events_severity_idx').on(t.severity),
    index('abuse_events_signal_idx').on(t.signalType),
    index('abuse_events_created_idx').on(t.createdAt),
  ],
);

// ─── Sanctions ────────────────────────────────────────────────────────────────

/**
 * Active enforcement actions against an org (sending suspension, throttles, etc).
 * Checked on every send by the engine / workers layer to enforce the action.
 */
export const abuseSanctions = pgTable(
  'abuse_sanctions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Event that triggered this sanction (may be null for manual) */
    eventId: uuid('event_id').references(() => abuseEvents.id, { onDelete: 'set null' }),

    action: abuseActionEnum('action').notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),

    /**
     * Throttle rate in emails/hour (only applies when action='throttle').
     * 0 = unrestricted; positive = hard cap.
     */
    throttleRatePerHour: integer('throttle_rate_per_hour').notNull().default(0),

    /** Sanction becomes ineffective at this time. NULL = indefinite. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    active: boolean('active').notNull().default(true),

    /** Admin who created / lifted the sanction */
    createdBy: uuid('created_by'),
    liftedBy: uuid('lifted_by'),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('abuse_sanctions_org_idx').on(t.orgId),
    index('abuse_sanctions_active_idx').on(t.orgId, t.active),
    index('abuse_sanctions_expires_idx').on(t.expiresAt),
  ],
);

// ─── Spam traps / honeypots ───────────────────────────────────────────────────

/**
 * Known-bad addresses to watch for in customer send lists.
 * Hitting one is a strong abuse signal — indicates lists were purchased or
 * harvested rather than organically collected.
 *
 * Email is stored as SHA-256 hash for privacy; engine hashes the recipient
 * during splitter phase and looks up in this table.
 */
export const spamTraps = pgTable(
  'spam_traps',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** SHA-256 hex hash of the lowercase email address */
    emailHash: varchar('email_hash', { length: 64 }).notNull(),

    /** Type: 'pristine' | 'recycled' | 'typo' | 'honeypot' */
    trapType: varchar('trap_type', { length: 20 }).notNull(),

    /** Source: 'spamhaus' | 'validity' | 'internal' | 'manual' */
    source: varchar('source', { length: 50 }).notNull().default('internal'),

    active: boolean('active').notNull().default(true),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('spam_traps_hash_idx').on(t.emailHash),
    index('spam_traps_active_idx').on(t.active),
  ],
);

/**
 * One row per (org, spam trap) hit. Used to score abuse and correlate with
 * specific campaigns that triggered the hit.
 */
export const spamTrapHits = pgTable(
  'spam_trap_hits',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    trapId: uuid('trap_id')
      .notNull()
      .references(() => spamTraps.id, { onDelete: 'cascade' }),

    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),

    /** Hash of the email that hit the trap (should equal trap's hash) */
    emailHash: varchar('email_hash', { length: 64 }).notNull(),

    hitAt: timestamp('hit_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('spam_trap_hits_org_idx').on(t.orgId),
    index('spam_trap_hits_campaign_idx').on(t.campaignId),
    index('spam_trap_hits_time_idx').on(t.hitAt),
  ],
);

export type AbuseRule = typeof abuseRules.$inferSelect;
export type NewAbuseRule = typeof abuseRules.$inferInsert;
export type AbuseEvent = typeof abuseEvents.$inferSelect;
export type NewAbuseEvent = typeof abuseEvents.$inferInsert;
export type AbuseSanction = typeof abuseSanctions.$inferSelect;
export type NewAbuseSanction = typeof abuseSanctions.$inferInsert;
export type SpamTrap = typeof spamTraps.$inferSelect;
export type SpamTrapHit = typeof spamTrapHits.$inferSelect;
