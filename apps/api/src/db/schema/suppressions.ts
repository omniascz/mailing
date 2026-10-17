import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { suppressionReasonEnum } from './enums.js';

export const suppressions = pgTable(
  'suppressions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    reason: suppressionReasonEnum('reason').notNull(),
    notes: varchar('notes', { length: 1000 }),
    /**
     * Fingerprint of the address an erasure removed, suppressionEmailHash():
     * HMAC-SHA256 under SUPPRESSION_HASH_KEY, hex (a plain SHA-256 before
     * Z150). Set on the row anonymizeContact writes in place of `email`, so
     * the erased person stays suppressed without the list keeping their
     * address, or a value the database alone can turn back into it. Every
     * send decision matches it (services/suppressions/email.ts).
     */
    emailHash: text('email_hash'),
    /**
     * Fingerprint of the phone number an erasure removed,
     * suppressionPhoneHash() (services/suppressions/phone.ts): HMAC-SHA256
     * under the same key, of `phone:` and the normalised number (Z180). Set
     * only on a row of its own that anonymizeContact writes (email,
     * email_hash and phone NULL) — never next to email_hash, whose row a
     * double opt-in confirmation deletes. A campaign's or a flow's marketing
     * SMS and WhatsApp match it; nothing lifts it.
     */
    phoneHash: text('phone_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('suppressions_org_id_idx').on(t.orgId),
    // One row per reason, not per address: an address can be unsubscribed AND
    // hard-bounced at once, and each consumer reads the reason it cares about
    // (the #225 gate lets 'unsubscribe' through for transactional mail;
    // resubscribeContact lifts only that one). (org, email) used to be unique,
    // so a later reason could not be written next to an earlier one.
    uniqueIndex('suppressions_org_email_reason_idx').on(t.orgId, t.email, t.reason),
    uniqueIndex('suppressions_org_phone_idx').on(t.orgId, t.phone),
    index('suppressions_email_idx').on(t.email),
    // Every lookup that decides a send matches lower(email) on both sides
    // (services/suppressions/email.ts), which no index above can serve.
    index('suppressions_org_lower_email_idx').on(t.orgId, sql`lower(${t.email})`),
    index('suppressions_org_email_hash_idx').on(t.orgId, t.emailHash),
    index('suppressions_org_phone_hash_idx').on(t.orgId, t.phoneHash),
  ],
);

export type Suppression = typeof suppressions.$inferSelect;
export type NewSuppression = typeof suppressions.$inferInsert;
