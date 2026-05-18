import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const webPersonalizationActionEnum = pgEnum('web_personalization_action', [
  'hide',        // remove element from DOM
  'show',        // make hidden element visible
  'swap_text',   // replace innerHTML (with merge tags)
  'swap_html',   // replace outerHTML
  'add_class',   // add CSS class
  'remove_class',// remove CSS class
  'set_attr',    // set HTML attribute value
]);

export interface WebPersonalizationAudience {
  /** 'all' | 'segment:{segmentId}' | 'contact:{contactId}' | 'new_visitor' | 'returning_visitor' */
  type: string;
  value?: string;
}

export const webPersonalizationRules = pgTable('web_personalization_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id').notNull(),
  siteId: uuid('site_id'),  // null = all sites

  name: varchar('name', { length: 255 }).notNull(),

  /** CSS selector targeting the element(s) to modify */
  selector: text('selector').notNull(),

  action: webPersonalizationActionEnum('action').notNull().default('swap_text'),

  /** Content for swap_text / swap_html / add_class / set_attr */
  value: text('value'),

  /** URL pattern to restrict to (glob, e.g. '/products/*') */
  urlPattern: varchar('url_pattern', { length: 2048 }),

  /** Audience targeting */
  audience: jsonb('audience').$type<WebPersonalizationAudience>().notNull().default({ type: 'all' }),

  /** Priority — higher wins when multiple rules match same selector */
  priority: varchar('priority', { length: 10 }).notNull().default('10'),

  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('web_pers_rules_org_idx').on(t.orgId),
  index('web_pers_rules_site_idx').on(t.siteId),
]);

export type WebPersonalizationRule = typeof webPersonalizationRules.$inferSelect;
