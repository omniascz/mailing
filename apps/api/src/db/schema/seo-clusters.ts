import { pgTable, uuid, varchar, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// ── Topic clusters (pillar + spokes) ─────────────────────────────────────────

export const seoTopicClusters = pgTable('seo_topic_clusters', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status:      varchar('status', { length: 32 }).notNull().default('draft'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index('seo_clusters_org_idx').on(t.orgId),
}));

// ── Pillar & spoke pages ──────────────────────────────────────────────────────

export const seoClusterPages = pgTable('seo_cluster_pages', {
  id:         uuid('id').primaryKey().defaultRandom(),
  orgId:      uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clusterId:  uuid('cluster_id').notNull().references(() => seoTopicClusters.id, { onDelete: 'cascade' }),
  pageType:   varchar('page_type', { length: 16 }).notNull().default('spoke'), // 'pillar' | 'spoke'
  title:      varchar('title', { length: 500 }).notNull(),
  url:        text('url'),
  targetKeyword: varchar('target_keyword', { length: 255 }),
  status:     varchar('status', { length: 32 }).notNull().default('idea'),
  wordCount:  integer('word_count'),
  notes:      text('notes'),
  metadata:   jsonb('metadata').default({}),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clusterIdx:  index('seo_cluster_pages_cluster_idx').on(t.clusterId),
  orgTypeIdx:  index('seo_cluster_pages_org_type_idx').on(t.orgId, t.pageType),
}));

// ── Keyword assignments per page ──────────────────────────────────────────────

export const seoKeywords = pgTable('seo_keywords', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  keyword:      varchar('keyword', { length: 500 }).notNull(),
  language:     varchar('language', { length: 8 }).notNull().default('en'),
  country:      varchar('country', { length: 4 }).notNull().default('US'),
  searchVolume: integer('search_volume'),
  difficulty:   integer('difficulty'),
  cpc:          text('cpc'),
  intent:       varchar('intent', { length: 32 }),
  enrichedAt:   timestamp('enriched_at', { withTimezone: true }),
  rawData:      jsonb('raw_data').default({}),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgKeywordUq: uniqueIndex('seo_keywords_org_kw_uq').on(t.orgId, t.keyword, t.language, t.country),
  orgVolumeIdx: index('seo_keywords_org_volume_idx').on(t.orgId, t.searchVolume),
}));

// ── Rank tracker: tracked keyword-URL pairs ───────────────────────────────────

export const seoRankTracking = pgTable('seo_rank_tracking', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  keyword:   varchar('keyword', { length: 500 }).notNull(),
  url:       text('url').notNull(),
  language:  varchar('language', { length: 8 }).notNull().default('en'),
  country:   varchar('country', { length: 4 }).notNull().default('US'),
  active:    boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgUq:    uniqueIndex('seo_rank_tracking_uq').on(t.orgId, t.keyword, t.url, t.country),
  activeIdx: index('seo_rank_tracking_active_idx').on(t.orgId, t.active),
}));

// ── Rank snapshots (daily) ────────────────────────────────────────────────────

export const seoRankSnapshots = pgTable('seo_rank_snapshots', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  trackingId:  uuid('tracking_id').notNull().references(() => seoRankTracking.id, { onDelete: 'cascade' }),
  date:        varchar('date', { length: 10 }).notNull(),  // YYYY-MM-DD
  position:    integer('position'),
  url:         text('url'),
  title:       text('title'),
  rawData:     jsonb('raw_data').default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  trackingDateUq: uniqueIndex('seo_rank_snapshots_uq').on(t.trackingId, t.date),
  orgDateIdx:     index('seo_rank_snapshots_org_date_idx').on(t.orgId, t.date),
}));

// ── On-page audit results ─────────────────────────────────────────────────────

export const seoAuditResults = pgTable('seo_audit_results', {
  id:           uuid('id').primaryKey().defaultRandom(),
  orgId:        uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  url:          text('url').notNull(),
  title:        text('title'),
  metaDesc:     text('meta_desc'),
  h1:           text('h1'),
  wordCount:    integer('word_count'),
  readability:  text('readability'),
  score:        integer('score'),
  issues:       jsonb('issues').default([]),
  headings:     jsonb('headings').default({}),
  internalLinks: jsonb('internal_links').default([]),
  images:       jsonb('images').default([]),
  rawData:      jsonb('raw_data').default({}),
  auditedAt:    timestamp('audited_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgUrlIdx: index('seo_audit_results_org_url_idx').on(t.orgId, t.url),
  orgDateIdx: index('seo_audit_results_org_date_idx').on(t.orgId, t.auditedAt),
}));
