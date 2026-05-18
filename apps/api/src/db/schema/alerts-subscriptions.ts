import { pgTable, uuid, varchar, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const backInStockSubscriptions = pgTable(
  'back_in_stock_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 128 }).notNull(),
    channel: varchar('channel', { length: 32 }).notNull().default('email'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('back_in_stock_org_sku_idx').on(t.orgId, t.sku)],
);

export const priceDropSubscriptions = pgTable(
  'price_drop_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 128 }).notNull(),
    channel: varchar('channel', { length: 32 }).notNull().default('email'),
    priceAtSubscribe: decimal('price_at_subscribe', { precision: 12, scale: 2 }).notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('price_drop_org_sku_idx').on(t.orgId, t.sku)],
);

export type BackInStockSubscription = typeof backInStockSubscriptions.$inferSelect;
export type PriceDropSubscription = typeof priceDropSubscriptions.$inferSelect;
