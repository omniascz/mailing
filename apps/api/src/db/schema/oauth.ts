import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { users } from './users.js';

/** Registered third-party OAuth 2.0 applications. */
export const oauthApps = pgTable(
  'oauth_apps',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    clientId: varchar('client_id', { length: 64 }).notNull().unique(),
    clientSecretHash: varchar('client_secret_hash', { length: 256 }).notNull(),
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oauth_apps_org_idx').on(t.orgId)],
);

/** Authorisation codes — short-lived, single-use. */
export const oauthCodes = pgTable('oauth_codes', {
  code: varchar('code', { length: 64 }).primaryKey(),
  appId: uuid('app_id')
    .notNull()
    .references(() => oauthApps.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  redirectUri: varchar('redirect_uri', { length: 1024 }).notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Long-lived access tokens issued after code exchange. */
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tokenHash: varchar('token_hash', { length: 256 }).notNull().unique(),
    refreshTokenHash: varchar('refresh_token_hash', { length: 256 }).unique(),
    appId: uuid('app_id')
      .notNull()
      .references(() => oauthApps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oauth_tokens_user_idx').on(t.userId), index('oauth_tokens_app_idx').on(t.appId)],
);

export type OAuthApp = typeof oauthApps.$inferSelect;
export type OAuthCode = typeof oauthCodes.$inferSelect;
export type OAuthToken = typeof oauthTokens.$inferSelect;
