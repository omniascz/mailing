import { pgTable, uuid, varchar, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const twoFactorSecrets = pgTable('two_factor_secrets', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secret: varchar('secret', { length: 64 }).notNull(),
  backupCodes: jsonb('backup_codes').$type<string[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(false),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TwoFactorSecret = typeof twoFactorSecrets.$inferSelect;
