import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const adPlacementTypeEnum = pgEnum('ad_placement_type', [
  'banner',
  'sponsored_section',
  'native_content',
  'classified',
]);

export const adStatusEnum = pgEnum('ad_status', [
  'pending',
  'approved',
  'active',
  'paused',
  'completed',
  'rejected',
]);

/** An ad slot — defines where/how ads appear in a newsletter */
export const newsletterAdSlots = pgTable(
  'newsletter_ad_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    placementType: adPlacementTypeEnum('placement_type').notNull().default('banner'),
    /** Price per placement in EUR */
    priceEur: numeric('price_eur', { precision: 10, scale: 2 }).notNull(),
    /** Approx subscriber reach at time of booking */
    estimatedReach: integer('estimated_reach').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index('ad_slots_org_idx').on(t.orgId) }),
);

/** A booked advertisement */
export const newsletterAds = pgTable(
  'newsletter_ads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    slotId: uuid('slot_id').notNull(),
    advertiserName: text('advertiser_name').notNull(),
    advertiserEmail: text('advertiser_email').notNull(),
    status: adStatusEnum('status').notNull().default('pending'),
    headline: text('headline').notNull(),
    bodyText: text('body_text').notNull(),
    imageUrl: text('image_url'),
    ctaText: text('cta_text').notNull().default('Learn more'),
    ctaUrl: text('cta_url').notNull(),
    /** Newsletter campaign this ad was placed in */
    campaignId: uuid('campaign_id'),
    paidEur: numeric('paid_eur', { precision: 10, scale: 2 }),
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    targeting: jsonb('targeting').$type<Record<string, unknown>>().default({}),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('newsletter_ads_org_idx').on(t.orgId),
    slotIdx: index('newsletter_ads_slot_idx').on(t.slotId),
    statusIdx: index('newsletter_ads_status_idx').on(t.orgId, t.status),
  }),
);

export type NewsletterAdSlot = typeof newsletterAdSlots.$inferSelect;
export type NewsletterAd = typeof newsletterAds.$inferSelect;
