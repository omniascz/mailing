import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, decimal, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { campaigns } from './campaigns.js';

/**
 * Revenue events — raw purchase tracking from tracking snippet or e-commerce webhooks.
 */
export const revenueEvents = pgTable(
  'revenue_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    orderId: varchar('order_id', { length: 128 }),
    amount: decimal('amount', { precision: 14, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    items: jsonb('items')
      .$type<Array<{ sku: string; name: string; qty: number; price: number }>>()
      .notNull()
      .default([]),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),
    attributedCampaignId: uuid('attributed_campaign_id').references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    attributionModel: varchar('attribution_model', { length: 20 }), // last_touch | first_touch | linear
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('revenue_events_org_idx').on(t.orgId),
    index('revenue_events_contact_idx').on(t.contactId),
    index('revenue_events_campaign_idx').on(t.attributedCampaignId),
    index('revenue_events_order_idx').on(t.orderId),
  ],
);

export type RevenueEvent = typeof revenueEvents.$inferSelect;
export type NewRevenueEvent = typeof revenueEvents.$inferInsert;
