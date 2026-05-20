import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { socialAccounts } from './social-accounts.js';

export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Content
    caption: text('caption'),
    mediaUrls: jsonb('media_urls').default([]), // array of S3/CDN URLs
    linkUrl: text('link_url'),
    hashtags: jsonb('hashtags').default([]),
    // Targeting
    accountIds: jsonb('account_ids').notNull().default([]), // socialAccounts ids to post to
    // Scheduling
    status: varchar('status', { length: 32 }).notNull().default('draft'), // draft|scheduled|published|failed
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Per-platform publish results
    results: jsonb('results').default([]), // [{accountId, platformPostId, url, error}]
    // Engagement metrics (updated by analytics sync)
    impressions: integer('impressions').notNull().default(0),
    engagements: integer('engagements').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index('social_posts_org_status_idx').on(t.orgId, t.status),
    orgScheduleIdx: index('social_posts_org_schedule_idx').on(t.orgId, t.scheduledAt),
  }),
);

export const socialMentions = pgTable(
  'social_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 32 }).notNull(),
    platformMentionId: varchar('platform_mention_id', { length: 255 }).notNull(),
    type: varchar('type', { length: 32 }).notNull().default('mention'), // mention|comment|dm|review
    authorUsername: varchar('author_username', { length: 255 }),
    authorId: varchar('author_id', { length: 255 }),
    body: text('body'),
    url: text('url'),
    sentiment: varchar('sentiment', { length: 16 }), // positive|neutral|negative
    matchedKeyword: varchar('matched_keyword', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull().default('new'), // new|read|replied|ignored
    rawData: jsonb('raw_data').default({}),
    mentionedAt: timestamp('mentioned_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPlatformMentionUq: index('social_mentions_uq_idx').on(
      t.orgId,
      t.platform,
      t.platformMentionId,
    ),
    orgStatusIdx: index('social_mentions_org_status_idx').on(t.orgId, t.status),
    orgDateIdx: index('social_mentions_org_date_idx').on(t.orgId, t.mentionedAt),
  }),
);

export const socialMonitoringKeywords = pgTable(
  'social_monitoring_keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 255 }).notNull(),
    platforms: jsonb('platforms').default([]), // [] = all
    active: varchar('active', { length: 8 }).notNull().default('true'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('social_monitoring_kw_org_idx').on(t.orgId),
  }),
);

export const socialAnalyticsSnapshots = pgTable(
  'social_analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'cascade' }),
    date: varchar('date', { length: 10 }).notNull(),
    followers: integer('followers').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    engagements: integer('engagements').notNull().default(0),
    rawData: jsonb('raw_data').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountDateIdx: index('social_analytics_account_date_idx').on(t.accountId, t.date),
    orgDateIdx: index('social_analytics_org_date_idx').on(t.orgId, t.date),
  }),
);
