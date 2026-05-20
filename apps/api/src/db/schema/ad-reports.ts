import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { adAccounts } from './ad-accounts.js';

export const adPerformanceSnapshots = pgTable(
  'ad_performance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    date: varchar('date', { length: 10 }).notNull(),
    platform: varchar('platform', { length: 32 }).notNull(),
    campaignId: varchar('campaign_id', { length: 255 }),
    campaignName: varchar('campaign_name', { length: 255 }),
    adSetId: varchar('ad_set_id', { length: 255 }),
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    spend: numeric('spend', { precision: 14, scale: 4 }).notNull().default('0'),
    conversions: integer('conversions').notNull().default(0),
    revenue: numeric('revenue', { precision: 14, scale: 2 }).notNull().default('0'),
    rawData: jsonb('raw_data').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDateIdx: index('ad_perf_org_date_idx').on(t.orgId, t.date),
    accountDateIdx: index('ad_perf_account_date_idx').on(t.adAccountId, t.date),
  }),
);
