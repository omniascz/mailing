import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contacts } from './contacts.js';
import { organizations } from './organizations.js';

/**
 * Multi-email profiles — Klaviyo supports up to 5 emails per profile
 * with independent consent and verification state.
 */
export const contactEmails = pgTable(
  'contact_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    consent: varchar('consent', { length: 32 }).notNull().default('pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contact_emails_org_email_uq').on(t.orgId, sql`LOWER(${t.email})`),
    index('contact_emails_contact_idx').on(t.contactId),
  ],
);

export type ContactEmail = typeof contactEmails.$inferSelect;
