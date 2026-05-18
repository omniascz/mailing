import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const aiFeatureEnum = pgEnum('ai_feature', [
  'segment_from_description',
  'generate_email',
  'subject_lines',
  'brand_voice',
  'campaign_summary',
  'translate',
  'html_to_blocks',
  'product_scraper',
  'accessibility_check',
  'other',
]);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    model: varchar('model', { length: 100 }).notNull(),
    feature: aiFeatureEnum('feature').notNull().default('other'),

    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),

    /** Cost in USD, stored as numeric(10,6) */
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),

    /** Whether the response was served from Redis cache */
    cached: varchar('cached', { length: 5 }).notNull().default('false'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_usage_org_id_idx').on(t.orgId),
    index('ai_usage_feature_idx').on(t.feature),
    index('ai_usage_created_at_idx').on(t.createdAt),
  ],
);

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
