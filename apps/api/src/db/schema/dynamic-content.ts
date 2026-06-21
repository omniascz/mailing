/**
 * Server-side dynamic content — swap email content blocks at open time
 * based on real-time conditions (time of day, location, stock level, weather, etc.).
 * Inspired by Movable Ink, built into ForgeMsg at no extra cost.
 */
import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, pgEnum,
} from 'drizzle-orm/pg-core';

export const dcTriggerTypeEnum = pgEnum('dc_trigger_type', [
  'time_of_day',    // morning / afternoon / evening
  'day_of_week',    // weekday vs weekend
  'days_since_send',// D+0, D+1, D+3, D+7
  'stock_level',    // product in/out of stock
  'weather',        // rain / sun / temperature
  'contact_prop',   // based on contact property value
  'geo',            // country / city of opener
  'countdown',      // real-time countdown timer to deadline
  'live_price',     // fetch live product price at open time
  'custom_api',     // call org-defined API endpoint
]);

/** A rule set: conditions → content variant to show */
export interface DcVariant {
  id: string;
  label: string;
  conditions: Array<{
    triggerType: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
    value: unknown;
  }>;
  contentHtml: string;
  priority: number; // lower wins when multiple match
}

export const dynamicContentBlocks = pgTable(
  'dynamic_content_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    /** Block placeholder tag used in email HTML: <!-- DC:block-id --> */
    placeholderTag: text('placeholder_tag').notNull(),
    variants: jsonb('variants').$type<DcVariant[]>().notNull().default([]),
    /** Fallback HTML shown when no variant matches */
    fallbackHtml: text('fallback_html').notNull(),
    /** External data source URL (for stock/price/weather variants) */
    dataSourceUrl: text('data_source_url'),
    dataSourceHeaders: jsonb('data_source_headers').$type<Record<string, string>>(),
    cacheTtlSeconds: integer('cache_ttl_seconds').notNull().default(300),
    active: boolean('active').notNull().default(true),
    impressions: integer('impressions').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('dynamic_content_org_idx').on(t.orgId),
    placeholderIdx: index('dynamic_content_placeholder_idx').on(t.orgId, t.placeholderTag),
  }),
);

export type DynamicContentBlock = typeof dynamicContentBlocks.$inferSelect;
