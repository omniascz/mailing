import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { planEnum, dataRegionEnum } from './enums.js';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    plan: planEnum('plan').notNull().default('free'),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    /** Parent org for sub-account hierarchies (#273). NULL for top-level orgs. */
    parentOrgId: uuid('parent_org_id'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    dataRegion: dataRegionEnum('data_region').notNull().default('us'),
    ipRestrictionsEnabled: boolean('ip_restrictions_enabled').notNull().default(false),
    /** HIPAA compliance mode — enables PHI safeguards and audit hardening (#231) */
    hipaaMode: boolean('hipaa_mode').notNull().default(false),
    /**
     * Sprint D.8 — ePrivacy strict mode. When true, batch-sender skips
     * click/open tracking for recipients who haven't recorded explicit
     * consent on the 'tracking' channel (contact_channel_consents). When
     * false (default), tracking is applied to every non-transactional
     * send under the org's legitimate-interest claim.
     */
    trackingEuStrict: boolean('tracking_eu_strict').notNull().default(false),
    /** If set, this org IS a sandbox of the referenced parent org (#342). */
    sandboxOfOrgId: uuid('sandbox_of_org_id'),
    /** 'none' | 'sandbox' — drives send guardrails (no real external sends). */
    sandboxMode: varchar('sandbox_mode', { length: 16 }).notNull().default('none'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('organizations_slug_idx').on(t.slug),
    index('organizations_stripe_customer_idx').on(t.stripeCustomerId),
    index('organizations_parent_idx').on(t.parentOrgId),
    index('organizations_sandbox_parent_idx').on(t.sandboxOfOrgId),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
