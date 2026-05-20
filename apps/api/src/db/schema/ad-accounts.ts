import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const AD_PLATFORMS = [
  'facebook_ads',
  'google_ads',
  'linkedin_ads',
  'tiktok_ads',
  'sklik',
] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const adAccounts = pgTable(
  'ad_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 32 }).notNull(),
    platformAccountId: varchar('platform_account_id', { length: 255 }).notNull(),
    accountName: varchar('account_name', { length: 255 }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPlatformUq: uniqueIndex('ad_accounts_org_platform_uq').on(
      t.orgId,
      t.platform,
      t.platformAccountId,
    ),
    orgActiveIdx: index('ad_accounts_org_active_idx').on(t.orgId, t.active),
  }),
);

// Records of audience syncs
export const adAudienceSyncs = pgTable(
  'ad_audience_syncs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id'),
    listId: uuid('list_id'),
    audienceName: varchar('audience_name', { length: 255 }).notNull(),
    platformAudienceId: varchar('platform_audience_id', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    contactsUploaded: jsonb('contacts_uploaded').default(0),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ad_audience_syncs_org_idx').on(t.orgId),
    adAccountIdx: index('ad_audience_syncs_account_idx').on(t.adAccountId),
  }),
);
