import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  smallint,
  decimal,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { contacts } from './contacts.js';
import { users } from './users.js';

export const productReviews = pgTable(
  'product_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
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

// ─── Reviews collection module (§9 P1) ─────────────────────────────────────
//
// Distinct from productReviews above (legacy, no moderation state). The new
// `reviews` table carries a full moderation lifecycle + sentiment analysis;
// `review_requests` holds the per-order tokens that authenticate the public
// submit endpoint.

export const reviewStatusEnum = pgEnum('review_status', [
  'pending',
  'approved',
  'rejected',
  'spam',
]);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    productSku: varchar('product_sku', { length: 128 }),
    productName: varchar('product_name', { length: 255 }),
    orderId: varchar('order_id', { length: 128 }),
    rating: smallint('rating').notNull(),
    title: varchar('title', { length: 255 }),
    body: text('body').notNull(),
    status: reviewStatusEnum('status').notNull().default('pending'),
    /** 'positive' | 'neutral' | 'negative' — filled by sentiment analyser. */
    sentiment: varchar('sentiment', { length: 16 }),
    /** -1.000 (very negative) … +1.000 (very positive). */
    sentimentScore: decimal('sentiment_score', { precision: 4, scale: 3 }),
    /** Where the review originated: public_form, import, sync_trustpilot, … */
    source: varchar('source', { length: 32 }).notNull().default('public_form'),
    moderationReason: varchar('moderation_reason', { length: 255 }),
    moderatedByUserId: uuid('moderated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('reviews_org_status_idx').on(t.orgId, t.status),
    index('reviews_org_product_idx').on(t.orgId, t.productSku),
    index('reviews_org_created_idx').on(t.orgId, t.createdAt),
  ],
);

export const reviewRequests = pgTable(
  'review_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    orderId: varchar('order_id', { length: 128 }),
    productSku: varchar('product_sku', { length: 128 }),
    token: varchar('token', { length: 64 }).notNull().unique(),
    reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '60 days'`),
  },
  (t) => [
    index('review_requests_org_contact_idx').on(t.orgId, t.contactId),
    index('review_requests_token_idx').on(t.token),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type NewReviewRequest = typeof reviewRequests.$inferInsert;

// Silence unused — `integer` and `jsonb` are still consumed by the legacy
// productReviews definition above.
void integer;
void jsonb;
