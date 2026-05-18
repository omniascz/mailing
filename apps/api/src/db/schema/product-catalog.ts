import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, decimal, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 2048 }),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    imageUrl: varchar('image_url', { length: 1024 }),
    url: varchar('url', { length: 1024 }),
    categories: jsonb('categories').$type<string[]>().notNull().default([]),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    stock: integer('stock'),
    active: boolean('active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_org_idx').on(t.orgId),
    index('products_sku_idx').on(t.orgId, t.sku),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
