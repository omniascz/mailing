/**
 * Social contact identifiers — links platform-specific IDs to ForgeMsg contacts.
 *
 * Enables resolveContactByExternalId() in instagram.ts / messenger.ts so
 * inbound Universal Inbox messages can be linked to known contacts.
 *
 * A contact may have multiple social IDs (PSID, IGSID, Viber sender ID, etc.)
 */

import { pgTable, uuid, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';

export const socialContactIdentifiers = pgTable(
  'social_contact_identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    /** Platform identifier: 'instagram' | 'messenger' | 'viber' | 'whatsapp' */
    platform: varchar('platform', { length: 32 }).notNull(),
    /** Platform-specific user ID (PSID for Messenger, IGSID for Instagram, etc.) */
    externalId: varchar('external_id', { length: 255 }).notNull(),
    /** Optional display name from the platform */
    displayName: varchar('display_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('social_contact_identifiers_platform_external_uniq').on(
      t.orgId,
      t.platform,
      t.externalId,
    ),
    index('social_contact_identifiers_contact_idx').on(t.contactId),
    index('social_contact_identifiers_org_platform_idx').on(t.orgId, t.platform),
  ],
);

export type SocialContactIdentifier = typeof socialContactIdentifiers.$inferSelect;
