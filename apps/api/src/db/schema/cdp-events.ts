import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

/**
 * CDP event store (#267) — append-only high-throughput event log.
 *
 * The PG copy backs the near-real-time trait pipeline; each row is also
 * replicated to ClickHouse via Kafka (topic `cdp.events.v1`) for analytics
 * aggregations and the NL→SQL sandbox.
 *
 * Idempotency: callers supply an `event_id`; the unique partial index
 * enforces at-most-once per org. Retries with the same id are no-ops.
 */
export const cdpEvents = pgTable(
  'cdp_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

    /** Caller-supplied dedupe key (UUID v7 or any unique string). */
    eventId: varchar('event_id', { length: 128 }),

    /** Optional resolved contact (via identity graph) — nullable for anonymous events. */
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),

    /** Anonymous visitor cookie/device before contact is known. */
    anonymousId: varchar('anonymous_id', { length: 128 }),

    /** `track` | `page` | `identify` | `group` | `alias` | custom. */
    eventType: varchar('event_type', { length: 64 }).notNull(),

    /** Domain-level event name (e.g. "order_placed", "page_viewed"). */
    name: varchar('name', { length: 255 }).notNull(),

    /** Origin system: web_sdk | mobile_sdk | server | integration:<name>. */
    source: varchar('source', { length: 64 }),

    /** Arbitrary flat properties: price, sku, referrer, utm_*, ... */
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),

    /** Optional session/group context. */
    context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),

    /** When the event actually happened (may differ from ingest time). */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cdp_events_org_event_id_uq')
      .on(t.orgId, t.eventId)
      .where(sql`${t.eventId} IS NOT NULL`),
    index('cdp_events_org_name_idx').on(t.orgId, t.name),
    index('cdp_events_contact_idx').on(t.contactId),
    index('cdp_events_anon_idx').on(t.anonymousId),
    index('cdp_events_occurred_idx').on(t.occurredAt),
  ],
);

export type CdpEvent = typeof cdpEvents.$inferSelect;
export type NewCdpEvent = typeof cdpEvents.$inferInsert;

/**
 * Computed traits (#268) — materialized per-contact rollups refreshed by
 * the trait worker. Schemaless `values` jsonb lets the org register new
 * traits without migrations.
 *
 * Example values: { ltv: 1420.50, total_orders: 7, last_purchase_at: "..." }
 */
export const contactTraits = pgTable(
  'contact_traits',
  {
    contactId: uuid('contact_id')
      .primaryKey()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

    values: jsonb('values').$type<Record<string, unknown>>().notNull().default({}),

    /** Version bumped on each recompute — lets activation cache invalidate. */
    version: varchar('version', { length: 32 }).notNull().default('0'),

    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_traits_org_idx').on(t.orgId),
    index('contact_traits_computed_idx').on(t.computedAt),
  ],
);

export type ContactTraits = typeof contactTraits.$inferSelect;

/**
 * Activation destinations (#266) — reverse-ETL targets for segments/traits.
 * Re-uses the warehouse-sync config pattern but is contact-grain, not entity-grain.
 */
export const activationDestinations = pgTable(
  'activation_destinations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),

    /** salesforce | hubspot | mailchimp | webhook | meta_ads | google_ads | tiktok_ads */
    kind: varchar('kind', { length: 32 }).notNull(),

    /** Provider-specific config (API keys via secret-ref, list ids, audience ids, …) */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),

    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activation_destinations_org_idx').on(t.orgId)],
);

export const activationRuns = pgTable(
  'activation_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => activationDestinations.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id'),
    mode: varchar('mode', { length: 16 }).notNull().default('upsert'),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    rowsProcessed: varchar('rows_processed', { length: 32 }).notNull().default('0'),
    rowsSucceeded: varchar('rows_succeeded', { length: 32 }).notNull().default('0'),
    rowsFailed: varchar('rows_failed', { length: 32 }).notNull().default('0'),
    error: varchar('error', { length: 2000 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('activation_runs_org_idx').on(t.orgId),
    index('activation_runs_dest_idx').on(t.destinationId),
  ],
);

export type ActivationDestination = typeof activationDestinations.$inferSelect;
export type ActivationRun = typeof activationRuns.$inferSelect;
