/**
 * BIMI (Brand Indicators for Message Identification) configuration.
 *
 * BIMI allows orgs to display their brand logo next to emails in supporting
 * clients (Apple Mail, Gmail, Yahoo). Requirements:
 *   - DMARC at p=quarantine or p=reject
 *   - SVG logo (Tiny 1.2 profile)
 *   - Optionally: VMC (Verified Mark Certificate) for Gmail
 *
 * DNS record format:
 *   default._bimi.{domain} TXT "v=BIMI1; l={svgUrl}; a={vmcUrl}"
 *   (a= is optional, required for Gmail logo display)
 */

import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const bimiConfigs = pgTable(
  'bimi_configs',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: varchar('org_id', { length: 36 }).notNull(),

    /** Sending domain this BIMI record is for (e.g. "company.cz") */
    domain: varchar('domain', { length: 255 }).notNull(),

    /** HTTPS URL to a Tiny 1.2 SVG logo */
    svgLogoUrl: text('svg_logo_url').notNull(),

    /** Optional HTTPS URL to a VMC file (required for Gmail) */
    vmcUrl: text('vmc_url'),

    /** Generated DNS TXT record value (computed on save) */
    dnsRecordValue: text('dns_record_value').notNull(),

    /** Whether we've verified the record is live in DNS */
    isVerified: boolean('is_verified').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    /** Last DNS check result (null = not checked yet) */
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    lastCheckResult: varchar('last_check_result', { length: 50 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bimi_configs_org_domain_uidx').on(t.orgId, t.domain),
    index('bimi_configs_org_idx').on(t.orgId),
  ],
);

export type BimiConfig = typeof bimiConfigs.$inferSelect;
