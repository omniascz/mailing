import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Bi-directional CRM data sync (#355).
 *
 * A mapping binds an internal entity (contact, deal, account) to an external
 * CRM (HubSpot, Salesforce, Pipedrive) and defines field-level rules for how
 * changes propagate. The sync engine consumes these rules; mappings are the
 * source of truth the user can edit.
 *
 * Conflict policy is per-field:
 *   'local_wins'    — our value always wins on collision
 *   'remote_wins'   — external value wins
 *   'newer_wins'    — whichever was updated more recently
 *   'manual'        — flagged and surfaced in the UI for user resolution
 */

export const crmProviderEnum = pgEnum('crm_sync_provider', ['hubspot', 'salesforce', 'pipedrive']);

export const crmEntityEnum = pgEnum('crm_sync_entity', ['contact', 'deal', 'account']);

export const crmSyncDirectionEnum = pgEnum('crm_sync_direction', ['in', 'out', 'both']);

export const dataSyncMappings = pgTable(
  'data_sync_mappings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: crmProviderEnum('provider').notNull(),
    entity: crmEntityEnum('entity').notNull(),
    direction: crmSyncDirectionEnum('direction').notNull().default('both'),
    /** Per-field map: `{ localKey: { remoteKey, direction, conflict } }`. */
    fieldMap: jsonb('field_map').$type<Record<string, FieldRule>>().notNull().default({}),
    /** Filter applied before pulling from the remote (CRM-specific predicate). */
    pullFilter: jsonb('pull_filter').$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
    lastIncrementalSyncAt: timestamp('last_incremental_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('data_sync_mappings_org_provider_entity_uq').on(t.orgId, t.provider, t.entity),
    index('data_sync_mappings_org_idx').on(t.orgId),
  ],
);

/** Per-record pairing table so we can look up the remote id for any local id. */
export const dataSyncPairs = pgTable(
  'data_sync_pairs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: crmProviderEnum('provider').notNull(),
    entity: crmEntityEnum('entity').notNull(),
    localId: uuid('local_id').notNull(),
    remoteId: varchar('remote_id', { length: 128 }).notNull(),
    /** Hash of the last-synced remote payload — used to detect remote changes cheaply. */
    remoteHash: varchar('remote_hash', { length: 64 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('data_sync_pairs_provider_entity_local_uq').on(t.provider, t.entity, t.localId),
    uniqueIndex('data_sync_pairs_provider_entity_remote_uq').on(t.provider, t.entity, t.remoteId),
    index('data_sync_pairs_org_idx').on(t.orgId),
  ],
);

/** Conflicts surfaced to the user when `conflict: 'manual'`. */
export const dataSyncConflicts = pgTable(
  'data_sync_conflicts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    pairId: uuid('pair_id')
      .notNull()
      .references(() => dataSyncPairs.id, { onDelete: 'cascade' }),
    field: varchar('field', { length: 128 }).notNull(),
    localValue: jsonb('local_value').$type<unknown>(),
    remoteValue: jsonb('remote_value').$type<unknown>(),
    resolved: boolean('resolved').notNull().default(false),
    resolution: varchar('resolution', { length: 32 }), // 'local' | 'remote' | 'custom'
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('data_sync_conflicts_org_idx').on(t.orgId),
    index('data_sync_conflicts_pair_idx').on(t.pairId),
    index('data_sync_conflicts_unresolved_idx').on(t.orgId, t.resolved),
  ],
);

export interface FieldRule {
  remoteKey: string;
  direction: 'in' | 'out' | 'both';
  conflict: 'local_wins' | 'remote_wins' | 'newer_wins' | 'manual';
  /** Optional JS-like transform expression (evaluated via the calc-props evaluator). */
  transform?: string;
}

export type DataSyncMapping = typeof dataSyncMappings.$inferSelect;
export type NewDataSyncMapping = typeof dataSyncMappings.$inferInsert;
export type DataSyncPair = typeof dataSyncPairs.$inferSelect;
export type DataSyncConflict = typeof dataSyncConflicts.$inferSelect;
