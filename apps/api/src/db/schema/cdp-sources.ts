/**
 * CDP source connectors schema (#263).
 *
 * cdp_sources      — configured data source integrations (HubSpot, Shopify, Stripe, etc.)
 * cdp_sync_runs    — audit log of every sync run
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, varchar,jsonb,
  timestamp, integer, text, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const cdpSources = pgTable(
  'cdp_sources',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),

    /**
     * Connector kind:
     *   CRM:     hubspot | salesforce | pipedrive
     *   Ecom:    shopify | woocommerce | bigcommerce | stripe
     *   Support: zendesk | intercom | freshdesk
     *   Ads:     meta_ads | google_ads | tiktok_ads
     *   Analytics: google_analytics | segment | mixpanel
     *   Custom:  webhook (push) | http_pull
     */
    kind: varchar('kind', { length: 64 }).notNull(),

    /** Direction: pull (we fetch from source) | push (source sends to us via webhook) */
    direction: varchar('direction', { length: 8 }).notNull().default('pull'),

    /** Encrypted/redacted config: API keys, base URLs, mapping rules, field mappings */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),

    /** active | paused | error */
    status: varchar('status', { length: 16 }).notNull().default('active'),

    /** Cron expression for pull sources (e.g. "0 * * * *" = hourly) */
    syncCron: varchar('sync_cron', { length: 64 }).notNull().default('0 * * * *'),

    /** Watermark for incremental pull: ISO timestamp or cursor of last successful sync */
    lastCursor: text('last_cursor'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cdp_sources_org_name_uq').on(t.orgId, t.name),
    index('cdp_sources_org_kind_idx').on(t.orgId, t.kind),
    index('cdp_sources_status_idx').on(t.status),
  ],
);

export const cdpSyncRuns = pgTable(
  'cdp_sync_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull().references(() => cdpSources.id, { onDelete: 'cascade' }),

    /** pending | running | completed | failed */
    status: varchar('status', { length: 16 }).notNull().default('pending'),

    rowsPulled: integer('rows_pulled').notNull().default(0),
    rowsUpserted: integer('rows_upserted').notNull().default(0),
    rowsSkipped: integer('rows_skipped').notNull().default(0),
    rowsFailed: integer('rows_failed').notNull().default(0),

    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('cdp_sync_runs_source_idx').on(t.sourceId, t.startedAt),
    index('cdp_sync_runs_org_idx').on(t.orgId, t.startedAt),
  ],
);

export type CdpSource = typeof cdpSources.$inferSelect;
export type NewCdpSource = typeof cdpSources.$inferInsert;
export type CdpSyncRun = typeof cdpSyncRuns.$inferSelect;
