import { pgTable, uuid, varchar, boolean, bigint, text, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { deals } from './deals.js';

export const hubspotConnections = pgTable(
  'hubspot_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    hubId: varchar('hub_id', { length: 64 }),
    hubDomain: varchar('hub_domain', { length: 255 }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    portalId: varchar('portal_id', { length: 64 }),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    syncContacts: boolean('sync_contacts').notNull().default(true),
    syncDeals: boolean('sync_deals').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('hubspot_connections_org_uq').on(t.orgId),
    index('hubspot_connections_org_id_idx').on(t.orgId),
  ],
);

export const hubspotContactMap = pgTable(
  'hubspot_contact_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    hubspotVid: bigint('hubspot_vid', { mode: 'number' }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('hubspot_contact_map_contact_uq').on(t.orgId, t.contactId),
    uniqueIndex('hubspot_contact_map_vid_uq').on(t.orgId, t.hubspotVid),
    index('hubspot_contact_map_org_idx').on(t.orgId),
  ],
);

export const hubspotDealMap = pgTable(
  'hubspot_deal_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
    hubspotDealId: bigint('hubspot_deal_id', { mode: 'number' }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('hubspot_deal_map_deal_uq').on(t.orgId, t.dealId),
    uniqueIndex('hubspot_deal_map_hs_deal_uq').on(t.orgId, t.hubspotDealId),
    index('hubspot_deal_map_org_idx').on(t.orgId),
  ],
);

export type HubspotConnection = typeof hubspotConnections.$inferSelect;
export type HubspotContactMap = typeof hubspotContactMap.$inferSelect;
export type HubspotDealMap = typeof hubspotDealMap.$inferSelect;
