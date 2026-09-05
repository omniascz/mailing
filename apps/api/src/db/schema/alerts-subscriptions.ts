import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  decimal,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const backInStockSubscriptions = pgTable(
  'back_in_stock_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 128 }).notNull(),
    channel: varchar('channel', { length: 32 }).notNull().default('email'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('back_in_stock_org_sku_idx').on(t.orgId, t.sku),
    // One PENDING subscription per person per SKU. The endpoint is public, so a
    // page that submits the form twice — or an abuser that submits it a
    // thousand times — must not turn into a thousand notifications. Partial, on
    // `notified_at IS NULL`, so a person who was notified and comes back to
    // wait for the next restock can subscribe again.
    uniqueIndex('back_in_stock_pending_uq')
      .on(t.orgId, t.sku, t.contactId)
      .where(sql`notified_at IS NULL`),
  ],
);

export const priceDropSubscriptions = pgTable(
  'price_drop_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 128 }).notNull(),
    channel: varchar('channel', { length: 32 }).notNull().default('email'),
    priceAtSubscribe: decimal('price_at_subscribe', { precision: 12, scale: 2 }).notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('price_drop_org_sku_idx').on(t.orgId, t.sku),
    uniqueIndex('price_drop_pending_uq')
      .on(t.orgId, t.sku, t.contactId)
      .where(sql`notified_at IS NULL`),
  ],
);

export type BackInStockSubscription = typeof backInStockSubscriptions.$inferSelect;
export type PriceDropSubscription = typeof priceDropSubscriptions.$inferSelect;
