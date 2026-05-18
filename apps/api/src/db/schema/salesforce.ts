import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, jsonb, boolean, index, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Per-org Salesforce connection (one active connection per org). Stores OAuth
 * tokens + the instance_url returned by SFDC's authorization endpoint, since
 * each customer's API base differs.
 */
export const salesforceConnections = pgTable(
  'salesforce_connections',
  {
    orgId: uuid('org_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
    instanceUrl: text('instance_url').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenIssuedAt: timestamp('token_issued_at', { withTimezone: true }).notNull().defaultNow(),
    /** SFDC user/org identification — useful for UI labels. */
    salesforceUserId: text('salesforce_user_id'),
    salesforceOrgId: text('salesforce_org_id'),
    apiVersion: varchar('api_version', { length: 8 }).notNull().default('v59.0'),
    /** Sync direction(s) and field maps. */
    syncContacts: boolean('sync_contacts').notNull().default(true),
    syncAccounts: boolean('sync_accounts').notNull().default(true),
    syncDeals: boolean('sync_deals').notNull().default(true),
    fieldMap: jsonb('field_map').$type<Record<string, Record<string, string>>>(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Bi-directional id map: ForgeMsg <-> Salesforce. Indexed both ways so we can
 * upsert from either side without duplicating entities.
 */
export const salesforceIdMap = pgTable(
  'salesforce_id_map',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    /** 'contact' | 'account' | 'deal' (Opportunity in SFDC) */
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    /** ForgeMsg uuid */
    localId: uuid('local_id').notNull(),
    /** Salesforce 18-char Id */
    salesforceId: varchar('salesforce_id', { length: 32 }).notNull(),
    /** Last write hash — for conflict resolution: skip writes if unchanged. */
    lastSyncedHash: varchar('last_synced_hash', { length: 64 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sf_idmap_local_idx').on(t.orgId, t.entityType, t.localId),
    uniqueIndex('sf_idmap_sfdc_idx').on(t.orgId, t.entityType, t.salesforceId),
  ],
);

/** Sync run history — one row per push or pull batch, useful for the UI dashboard. */
export const salesforceSyncRuns = pgTable(
  'salesforce_sync_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull(),
    /** 'push' (ForgeMsg → SFDC) or 'pull' (SFDC → ForgeMsg) */
    direction: varchar('direction', { length: 8 }).notNull(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    inserted: jsonb('inserted').$type<{ count: number }>(),
    updated: jsonb('updated').$type<{ count: number }>(),
    failed: jsonb('failed').$type<{ count: number; errors?: string[] }>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('sf_sync_runs_org_idx').on(t.orgId, t.startedAt)],
);

export type SalesforceConnection = typeof salesforceConnections.$inferSelect;
export type SalesforceIdMap = typeof salesforceIdMap.$inferSelect;
export type SalesforceSyncRun = typeof salesforceSyncRuns.$inferSelect;
