import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

export const ssoConfigurations = pgTable('sso_configurations', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 10 }).notNull(),
  samlEntityId: varchar('saml_entity_id', { length: 512 }),
  samlSsoUrl: varchar('saml_sso_url', { length: 1024 }),
  samlCertificate: text('saml_certificate'),
  oidcIssuer: varchar('oidc_issuer', { length: 512 }),
  oidcClientId: varchar('oidc_client_id', { length: 255 }),
  oidcClientSecret: varchar('oidc_client_secret', { length: 512 }),
  oidcAuthorizeUrl: varchar('oidc_authorize_url', { length: 1024 }),
  oidcTokenUrl: varchar('oidc_token_url', { length: 1024 }),
  oidcJwksUri: varchar('oidc_jwks_uri', { length: 1024 }),
  defaultRole: varchar('default_role', { length: 20 }).notNull().default('viewer'),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ssoLoginStates = pgTable(
  'sso_login_states',
  {
    state: varchar('state', { length: 64 }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    redirectUri: varchar('redirect_uri', { length: 1024 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sso_login_states_expires_idx').on(t.expiresAt)],
);

export type SsoConfiguration = typeof ssoConfigurations.$inferSelect;
export type SsoLoginState = typeof ssoLoginStates.$inferSelect;
