import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  real,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { campaigns } from './campaigns.js';
import { contacts } from './contacts.js';
import { emailEventTypeEnum, bounceTypeEnum, messageStreamEnum } from './enums.js';

/**
 * Email events — stored in PostgreSQL for the small/recent slice and replicated to
 * ClickHouse via Kafka for analytics. The PG copy backs near-real-time campaign UI;
 * ClickHouse handles aggregation queries.
 */
export const emailEvents = pgTable(
  'email_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    stream: messageStreamEnum('stream').notNull().default('broadcast'),
    eventType: emailEventTypeEnum('event_type').notNull(),
    bounceType: bounceTypeEnum('bounce_type'),

    messageId: varchar('message_id', { length: 255 }),
    linkUrl: varchar('link_url', { length: 2048 }),
    userAgent: varchar('user_agent', { length: 1024 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    deviceType: varchar('device_type', { length: 50 }),
    emailClient: varchar('email_client', { length: 100 }),
    // Geo enrichment (opens/clicks) — populated async from IP when a GeoIP
    // provider is configured (GEOIP_API_URL). ISO-3166 alpha-2 + city name.
    geoCountry: varchar('geo_country', { length: 2 }),
    geoCity: varchar('geo_city', { length: 120 }),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    /** A/B variant id (from ab_config.variants[].id). Null for non-A/B sends. */
    abVariantId: varchar('ab_variant_id', { length: 100 }),

    /** True when bot-detection classified this open/click as automated (security scanner, prefetch, etc.). */
    isBot: boolean('is_bot').notNull().default(false),
    /** Confidence 0.0-1.0 from bot scoring. */
    botScore: real('bot_score'),
    /** Comma-separated rule ids that flagged the event (e.g., "ua-pattern,fast-click"). */
    botReason: varchar('bot_reason', { length: 255 }),

    /** Apple Mail Privacy Protection: true when open was triggered by MPP prefetch (not real human open) */
    mppDetected: boolean('mpp_detected').notNull().default(false),
    /** Estimated real open probability 0-1 when mppDetected=true (inferred from subsequent clicks) */
    mppRealOpenProb: real('mpp_real_open_prob'),

    /** Send category (SendGrid parity) — denormalised from the campaign for
     *  category-level stats. */
    category: varchar('category', { length: 128 }),
    /** Receiving mailbox provider (gmail/outlook/yahoo/…) for ISP deliverability
     *  stats. Populated on the delivery path (send/deliver/bounce). */
    isp: varchar('isp', { length: 32 }),

    /**
     * The address one `send` row is for (Z137): a `send` row is one recipient,
     * on every path — the unit the plan limit, the plan send counter and the
     * invoice all count. Lower-cased bare address. NULL on rows written before
     * migration 0030 and on event types other than `send`.
     */
    recipient: varchar('recipient', { length: 320 }),
    /**
     * A sandboxed send (test-mode key, sandboxMode / sandbox_mode): recorded so
     * the developer can see it, never dispatched, and since Z137 not counted
     * against the plan and not billed.
     */
    sandbox: boolean('sandbox').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_events_org_id_idx').on(t.orgId),
    index('email_events_campaign_id_idx').on(t.campaignId),
    index('email_events_contact_id_idx').on(t.contactId),
    index('email_events_type_idx').on(t.eventType),
    index('email_events_created_at_idx').on(t.createdAt),
    index('email_events_ab_variant_idx').on(t.campaignId, t.abVariantId),
    index('email_events_org_category_idx').on(t.orgId, t.category),
    index('email_events_org_isp_idx').on(t.orgId, t.isp),
    // The plan's monthly send count (getPlanCapacity), asked on every
    // transactional send: org + 'send' + this billing period. With single-column
    // indexes only, Postgres read the whole org's rows: measured in Z135 at 500k
    // sends in a month, 80 ms and 20,400 buffers per send; with this, 17 ms and
    // 596. The count still grows with volume — see the Z135 report.
    index('email_events_org_type_created_idx').on(t.orgId, t.eventType, t.createdAt),
    // One `send` row per message and recipient (Z137). A job that writes the
    // same delivery twice — mta-sender run again on a stalled job — is refused
    // here, so no reader of `send` rows can count it twice; writers that can
    // repeat insert with ON CONFLICT DO NOTHING. Rows with no recipient (written
    // before migration 0030) are not constrained by it: NULLs are distinct.
    uniqueIndex('email_events_send_recipient_uq')
      .on(t.orgId, t.messageId, t.recipient)
      .where(sql`${t.eventType} = 'send'`),
    // The other events that happen once to one delivery (Z138), measured:
    // `deliver` and `failed` once per attempt that ended, `complaint` once per
    // message complained about. A job processed again, or an ISP repeating a
    // feedback report, used to store a second row — and `deliver` is the
    // denominator of every bounce and delivery rate. Not here, because they
    // repeat legitimately: `deferred` (once per attempt), `open`, `click`, and
    // `unsubscribe` (a list, then everything, from the same email).
    uniqueIndex('email_events_outcome_uq')
      .on(t.orgId, t.eventType, t.messageId, t.recipient)
      .where(sql`${t.eventType} IN ('deliver', 'failed', 'complaint')`),
    // A bounce once per type: a delay notice (soft) and then the final failure
    // (hard) about one delivery are two things the receiving side said, and
    // both are kept; the same one said twice is not.
    uniqueIndex('email_events_bounce_uq')
      .on(t.orgId, t.messageId, t.recipient, t.bounceType)
      .where(sql`${t.eventType} = 'bounce'`),
  ],
);

export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
