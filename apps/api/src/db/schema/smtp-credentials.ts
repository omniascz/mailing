/**
 * SMTP submission credentials — username/password pairs a customer configures
 * in their SMTP client to relay mail through ForgeMsg's submission server
 * (port 587), the way Amazon SES issues SMTP credentials from IAM.
 * The password is stored only as a bcrypt hash.
 */
import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const smtpCredentials = pgTable(
  'smtp_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    username: varchar('username', { length: 64 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    label: varchar('label', { length: 100 }),
    active: boolean('active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('smtp_credentials_org_idx').on(t.orgId)],
);

export type SmtpCredential = typeof smtpCredentials.$inferSelect;
