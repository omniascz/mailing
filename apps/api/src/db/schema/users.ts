import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { userRoleEnum, authProviderEnum } from './enums.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: userRoleEnum('role').notNull().default('viewer'),
    authProvider: authProviderEnum('auth_provider').notNull().default('email'),
    googleId: varchar('google_id', { length: 255 }),
    avatarUrl: varchar('avatar_url', { length: 1024 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerificationToken: varchar('email_verification_token', { length: 255 }),
    passwordResetToken: varchar('password_reset_token', { length: 255 }),
    passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_idx').on(t.email),
    index('users_org_id_idx').on(t.orgId),
    index('users_google_id_idx').on(t.googleId),
    index('users_email_verification_token_idx').on(t.emailVerificationToken),
    index('users_password_reset_token_idx').on(t.passwordResetToken),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
