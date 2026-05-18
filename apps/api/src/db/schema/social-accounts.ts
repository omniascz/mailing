import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

// Supported social platforms
export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'twitter', 'tiktok'] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];

export const socialAccounts = pgTable('social_accounts', {
  id:              uuid('id').primaryKey().defaultRandom(),
  orgId:           uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  platform:        varchar('platform', { length: 32 }).notNull(),
  platformUserId:  varchar('platform_user_id', { length: 255 }).notNull(),
  platformUsername: varchar('platform_username', { length: 255 }),
  displayName:     varchar('display_name', { length: 255 }),
  avatarUrl:       text('avatar_url'),
  accessToken:     text('access_token').notNull(),
  refreshToken:    text('refresh_token'),
  tokenExpiresAt:  timestamp('token_expires_at', { withTimezone: true }),
  scopes:          text('scopes'),
  active:          boolean('active').notNull().default(true),
  metadata:        jsonb('metadata').default({}),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgPlatformUq:  uniqueIndex('social_accounts_org_platform_uq').on(t.orgId, t.platform, t.platformUserId),
  orgActiveIdx:   index('social_accounts_org_active_idx').on(t.orgId, t.active),
}));

// OAuth state nonces (short-lived, for CSRF protection during OAuth flow)
export const socialOauthStates = pgTable('social_oauth_states', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull(),
  platform:  varchar('platform', { length: 32 }).notNull(),
  state:     varchar('state', { length: 128 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stateUq:   uniqueIndex('social_oauth_states_state_uq').on(t.state),
  expIdx:    index('social_oauth_states_exp_idx').on(t.expiresAt),
}));
