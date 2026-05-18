import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  bigint,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { accounts } from './accounts.js';
import { deals } from './deals.js';

/**
 * Raynet CRM connection (#370/#391). Raynet uses Basic-auth with:
 *   - instanceName (eshop/company slug, e.g. "acme")
 *   - username (email of API user)
 *   - apiKey (generated in Raynet admin)
 */
export const raynetConnections = pgTable(
  'raynet_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    instanceName: varchar('instance_name', { length: 128 }).notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    apiKey: text('api_key').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    syncContacts: boolean('sync_contacts').notNull().default(true),
    syncCompanies: boolean('sync_companies').notNull().default(true),
    syncDeals: boolean('sync_deals').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('raynet_connections_org_uq').on(t.orgId),
    index('raynet_connections_instance_idx').on(t.instanceName),
  ],
);

export const raynetContactMap = pgTable(
  'raynet_contact_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    raynetContactId: bigint('raynet_contact_id', { mode: 'number' }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('raynet_contact_map_contact_uq').on(t.orgId, t.contactId),
    uniqueIndex('raynet_contact_map_remote_uq').on(t.orgId, t.raynetContactId),
    index('raynet_contact_map_org_idx').on(t.orgId),
  ],
);

export const raynetCompanyMap = pgTable(
  'raynet_company_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    raynetCompanyId: bigint('raynet_company_id', { mode: 'number' }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('raynet_company_map_account_uq').on(t.orgId, t.accountId),
    uniqueIndex('raynet_company_map_remote_uq').on(t.orgId, t.raynetCompanyId),
    index('raynet_company_map_org_idx').on(t.orgId),
  ],
);

export const raynetDealMap = pgTable(
  'raynet_deal_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    raynetBusinessCaseId: bigint('raynet_business_case_id', { mode: 'number' }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('raynet_deal_map_deal_uq').on(t.orgId, t.dealId),
    uniqueIndex('raynet_deal_map_remote_uq').on(t.orgId, t.raynetBusinessCaseId),
    index('raynet_deal_map_org_idx').on(t.orgId),
  ],
);

export type RaynetConnection = typeof raynetConnections.$inferSelect;
export type RaynetContactMap = typeof raynetContactMap.$inferSelect;
export type RaynetCompanyMap = typeof raynetCompanyMap.$inferSelect;
export type RaynetDealMap = typeof raynetDealMap.$inferSelect;
