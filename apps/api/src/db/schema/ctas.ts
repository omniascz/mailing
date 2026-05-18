import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,

  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * CTA widgets (#340/#412). Small clickable units — buttons, banners,
 * popups — embedded in blog posts, emails, or third-party sites via a
 * public endpoint. Each CTA can A/B test variants and serve
 * segment-specific content.
 */

export const ctaTypeEnum = pgEnum('cta_type', [
  'button',
  'banner',
  'popup',
  'inline',
  'exit_intent',
]);

export const ctas = pgTable(
  'ctas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    type: ctaTypeEnum('type').notNull().default('button'),

    /** Rendered content: { headline?, body?, ctaText, ctaUrl, image?, backgroundColor?, … } */
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),

    /** Targeting rules (re-uses the site-messages condition shape). */
    conditions: jsonb('conditions')
      .$type<Array<{ trigger: string; operator: string; value: unknown }>>()
      .notNull()
      .default([]),

    /** Is this CTA currently serving? */
    active: boolean('active').notNull().default(false),

    /** Rotate among variants (see cta_variants); null when A/B not configured. */
    abRotationMode: varchar('ab_rotation_mode', { length: 16 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('ctas_org_idx').on(t.orgId),
    index('ctas_org_active_idx').on(t.orgId, t.active),
  ],
);

export const ctaVariants = pgTable(
  'cta_variants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ctaId: uuid('cta_id').notNull().references(() => ctas.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    weight: integer('weight').notNull().default(1),
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cta_variants_cta_idx').on(t.ctaId)],
);

export const ctaImpressions = pgTable(
  'cta_impressions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    ctaId: uuid('cta_id').notNull().references(() => ctas.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id'),
    visitorId: varchar('visitor_id', { length: 128 }),
    contactId: uuid('contact_id'),
    clicked: boolean('clicked').notNull().default(false),
    dismissed: boolean('dismissed').notNull().default(false),
    context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cta_impressions_cta_idx').on(t.ctaId, t.occurredAt),
    index('cta_impressions_variant_idx').on(t.variantId),
    index('cta_impressions_visitor_idx').on(t.visitorId),
  ],
);

export type Cta = typeof ctas.$inferSelect;
export type NewCta = typeof ctas.$inferInsert;
export type CtaVariant = typeof ctaVariants.$inferSelect;
export type CtaImpression = typeof ctaImpressions.$inferSelect;
