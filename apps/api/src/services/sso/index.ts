/**
 * Single Sign-On — SAML 2.0 + OIDC (#139 + #230).
 *
 * SAML: uses the production-grade saml.ts parser which verifies the
 * ds:Signature using the stored IdP certificate (RSA-SHA256/SHA1).
 * OIDC: decodes the ID token payload; the token is fetched directly from the
 * IdP token endpoint over TLS so signature verification is optional here;
 * production deployments can add JWKS via `jose` before GA.
 */

import { and, eq, gt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  ssoConfigurations, ssoLoginStates, users,
  type SsoConfiguration,
} from '../../db/schema/index.js';
import { createSession, type SessionData } from '../auth/sessions.js';
import { AppError } from '../../lib/app-error.js';
import type { UserRole } from '@forgemsg/shared';
import {
  parseSamlResponse,
  buildSamlRedirectUrl,
  buildSpMetadataXml,
} from '../auth/saml.js';

export type SsoType = 'saml' | 'oidc';

export interface SamlConfig {
  type: 'saml';
  samlEntityId: string;
  samlSsoUrl: string;
  samlCertificate: string;
  defaultRole?: UserRole;
  enabled?: boolean;
}

export interface OidcConfig {
  type: 'oidc';
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcAuthorizeUrl: string;
  oidcTokenUrl: string;
  oidcJwksUri?: string;
  defaultRole?: UserRole;
  enabled?: boolean;
}

export async function configureSso(orgId: string, config: SamlConfig | OidcConfig): Promise<SsoConfiguration> {
  const base = {
    orgId,
    type: config.type,
    defaultRole: config.defaultRole ?? 'viewer',
    enabled: config.enabled ?? true,
    updatedAt: new Date(),
  };
  const row = config.type === 'saml'
    ? { ...base, samlEntityId: config.samlEntityId, samlSsoUrl: config.samlSsoUrl, samlCertificate: config.samlCertificate }
    : {
      ...base,
      oidcIssuer: config.oidcIssuer, oidcClientId: config.oidcClientId,
      oidcClientSecret: config.oidcClientSecret, oidcAuthorizeUrl: config.oidcAuthorizeUrl,
      oidcTokenUrl: config.oidcTokenUrl, oidcJwksUri: config.oidcJwksUri ?? null,
    };

  const [existing] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.orgId, orgId)).limit(1);
  if (existing) {
    await db.update(ssoConfigurations).set(row).where(eq(ssoConfigurations.orgId, orgId));
  } else {
    await db.insert(ssoConfigurations).values(row);
  }
  const [out] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.orgId, orgId)).limit(1);
  return out!;
}

export async function getSsoConfig(orgId: string): Promise<SsoConfiguration | null> {
  const [row] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.orgId, orgId)).limit(1);
  return row ?? null;
}

export async function deleteSsoConfig(orgId: string): Promise<void> {
  await db.delete(ssoConfigurations).where(eq(ssoConfigurations.orgId, orgId));
}

export async function buildLoginUrl(orgId: string, redirectUri: string): Promise<string> {
  const cfg = await getSsoConfig(orgId);
  if (!cfg || !cfg.enabled) throw AppError.notFound('SSO configuration');

  const state = randomBytes(24).toString('base64url');
  await db.insert(ssoLoginStates).values({
    state, orgId, redirectUri,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  if (cfg.type === 'oidc') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.oidcClientId!,
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
    });
    return `${cfg.oidcAuthorizeUrl}?${params.toString()}`;
  }

  // SAML: SP-initiated SSO — generate deflated AuthnRequest redirect URL
  const spEntityId = process.env.APP_URL ?? 'https://app.forgemsg.com';
  const acsUrl = `${spEntityId}/api/v1/sso/saml/acs`;
  return buildSamlRedirectUrl(
    { entityId: spEntityId, acsUrl },
    { entityId: cfg.samlEntityId ?? '', ssoUrl: cfg.samlSsoUrl ?? '', certificate: cfg.samlCertificate ?? '' },
    state,
  );
}

export function getSpMetadataXml(_orgId: string): string {
  const spEntityId = process.env.APP_URL ?? 'https://app.forgemsg.com';
  const acsUrl = `${spEntityId}/api/v1/sso/saml/acs`;
  return buildSpMetadataXml({ entityId: spEntityId, acsUrl });
}

async function consumeState(state: string): Promise<{ orgId: string; redirectUri: string }> {
  const [row] = await db.select().from(ssoLoginStates)
    .where(and(eq(ssoLoginStates.state, state), gt(ssoLoginStates.expiresAt, new Date())))
    .limit(1);
  if (!row) throw AppError.badRequest('Invalid or expired state');
  await db.delete(ssoLoginStates).where(eq(ssoLoginStates.state, state));
  return { orgId: row.orgId, redirectUri: row.redirectUri };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw AppError.badRequest('Malformed ID token');
  const json = Buffer.from(parts[1]!, 'base64url').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

export async function processOidcCallback(state: string, code: string): Promise<{ token: string; user: SessionData }> {
  const { orgId, redirectUri } = await consumeState(state);
  const cfg = await getSsoConfig(orgId);
  if (!cfg || cfg.type !== 'oidc') throw AppError.badRequest('OIDC not configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.oidcClientId!,
    client_secret: cfg.oidcClientSecret!,
  });
  const resp = await fetch(cfg.oidcTokenUrl!, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw AppError.unauthorized('Token exchange failed');
  const tokenSet = await resp.json() as { id_token?: string; access_token?: string };
  if (!tokenSet.id_token) throw AppError.unauthorized('No id_token returned');

  const claims = decodeJwtPayload(tokenSet.id_token);
  const email = String(claims['email'] ?? '').toLowerCase();
  if (!email) throw AppError.unauthorized('No email claim in id_token');
  const name = (claims['name'] as string | undefined) ?? null;

  return provisionAndLogin(orgId, email, name, cfg.defaultRole as UserRole);
}

export async function processSamlAcs(samlResponseB64: string, relayState: string): Promise<{ token: string; user: SessionData }> {
  const { orgId } = await consumeState(relayState);
  const cfg = await getSsoConfig(orgId);
  if (!cfg || cfg.type !== 'saml') throw AppError.badRequest('SAML not configured');
  if (!cfg.samlCertificate) throw AppError.badRequest('SAML certificate not configured');

  const spEntityId = process.env.APP_URL ?? 'https://app.forgemsg.com';
  const acsUrl = `${spEntityId}/api/v1/sso/saml/acs`;

  let attrs;
  try {
    attrs = parseSamlResponse(
      samlResponseB64,
      {
        entityId: cfg.samlEntityId ?? '',
        ssoUrl: cfg.samlSsoUrl ?? '',
        certificate: cfg.samlCertificate,
      },
      { entityId: spEntityId, acsUrl },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SAML validation failed';
    throw AppError.unauthorized(msg);
  }

  // Map IdP role to our roles
  let role = cfg.defaultRole as UserRole;
  if (attrs.role) {
    const roleMap: Record<string, UserRole> = {
      admin: 'admin', administrator: 'admin', owner: 'owner',
      editor: 'editor', write: 'editor',
      viewer: 'viewer', read: 'viewer', readonly: 'viewer',
    };
    const mapped = roleMap[attrs.role.toLowerCase()];
    if (mapped) role = mapped;
  }

  return provisionAndLogin(orgId, attrs.email, attrs.displayName, role);
}

async function provisionAndLogin(
  orgId: string, email: string, name: string | null, defaultRole: UserRole,
): Promise<{ token: string; user: SessionData }> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userRow = existing;
  if (!userRow) {
    const [created] = await db.insert(users).values({
      orgId, email, name, role: defaultRole,
      authProvider: 'sso' as const, emailVerified: true,
    }).returning();
    userRow = created!;
  } else if (userRow.orgId !== orgId) {
    throw AppError.forbidden('User belongs to a different organization');
  }

  const session: SessionData = {
    userId: userRow.id,
    orgId: userRow.orgId,
    email: userRow.email,
    role: userRow.role as UserRole,
  };
  const token = await createSession(session);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userRow.id));
  return { token, user: session };
}
