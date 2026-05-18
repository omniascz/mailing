import { pgTable, uuid, varchar, integer, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';

export const productReviews = pgTable(
  'product_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 128 }).notNull(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    rating: integer('rating').notNull(),
    title: varchar('title', { length: 255 }),
    body: text('body'),
    authorName: varchar('author_name', { length: 255 }),
    photos: jsonb('photos').$type<Array<{ url: string; alt?: string }>>().notNull().default([]),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_reviews_org_sku_idx').on(t.orgId, t.sku),
    index('product_reviews_status_idx').on(t.orgId, t.status),
  ],
);

export type ProductReview = typeof productReviews.$inferSelect;
