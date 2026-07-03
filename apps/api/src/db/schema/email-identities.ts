/**
 * Verified email-address identities (SES VerifyEmailIdentity). An org proves it
 * controls an address by clicking a confirmation link. Verified identities are
 * used both as sanctioned sender addresses and as the allow-list of recipients
 * a sandbox account may send to.
 */
import { pgTable, uuid, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const emailIdentities = pgTable(
  'email_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'), // pending | verified
    /** Confirmation token (hashed not needed — single-use, short-lived by policy). */
    token: varchar('token', { length: 64 }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_identities_org_idx').on(t.orgId),
    unique('email_identities_org_email_uq').on(t.orgId, t.email),
  ],
);

export type EmailIdentity = typeof emailIdentities.$inferSelect;
