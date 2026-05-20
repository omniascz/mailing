/**
 * Minimal OAuth 2.0 (authorization-code + refresh-token) for third-party
 * apps built on top of MailForge. No PKCE; assumes the calling app is a
 * confidential client that protects its secret.
 */

import { and, eq, gt } from 'drizzle-orm';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db } from '../../db/client.js';
import { oauthApps, oauthCodes, oauthTokens } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export async function registerApp(
  orgId: string,
  data: {
    name: string;
    redirectUris: string[];
    scopes: string[];
  },
) {
  const clientId = randomToken(18);
  const clientSecret = randomToken(32);
  const [row] = await db
    .insert(oauthApps)
    .values({
      orgId,
      name: data.name,
      clientId,
      clientSecretHash: hash(clientSecret),
      redirectUris: data.redirectUris,
      scopes: data.scopes,
    })
    .returning();
  return { app: row!, clientSecret };
}

export async function issueAuthCode(params: {
  clientId: string;
  userId: string;
  orgId: string;
  redirectUri: string;
  scopes: string[];
}): Promise<string> {
  const [apprec] = await db
    .select()
    .from(oauthApps)
    .where(eq(oauthApps.clientId, params.clientId))
    .limit(1);
  if (!apprec) throw AppError.badRequest('Unknown client_id');
  if (!apprec.redirectUris.includes(params.redirectUri)) {
    throw AppError.badRequest('redirect_uri not registered');
  }

  const code = randomToken(24);
  await db.insert(oauthCodes).values({
    code,
    appId: apprec.id,
    userId: params.userId,
    orgId: params.orgId,
    redirectUri: params.redirectUri,
    scopes: params.scopes,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return code;
}

export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
  const [apprec] = await db
    .select()
    .from(oauthApps)
    .where(eq(oauthApps.clientId, params.clientId))
    .limit(1);
  if (!apprec) throw AppError.unauthorized('Invalid client');

  const hashBuf = Buffer.from(hash(params.clientSecret));
  const expectBuf = Buffer.from(apprec.clientSecretHash);
  if (hashBuf.length !== expectBuf.length || !timingSafeEqual(hashBuf, expectBuf)) {
    throw AppError.unauthorized('Invalid client secret');
  }

  const [cr] = await db
    .select()
    .from(oauthCodes)
    .where(and(eq(oauthCodes.code, params.code), gt(oauthCodes.expiresAt, new Date())))
    .limit(1);
  if (!cr) throw AppError.badRequest('Code expired or invalid');
  if (cr.redirectUri !== params.redirectUri) throw AppError.badRequest('redirect_uri mismatch');

  await db.delete(oauthCodes).where(eq(oauthCodes.code, params.code));

  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  await db.insert(oauthTokens).values({
    tokenHash: hash(accessToken),
    refreshTokenHash: hash(refreshToken),
    appId: apprec.id,
    userId: cr.userId,
    orgId: cr.orgId,
    scopes: cr.scopes,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return { accessToken, refreshToken, expiresIn: 3600, scope: cr.scopes.join(' ') };
}

export async function refreshToken(
  refreshTokenPlain: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.refreshTokenHash, hash(refreshTokenPlain)))
    .limit(1);
  if (!row || row.revokedAt) throw AppError.unauthorized('Invalid refresh token');

  const accessToken = randomToken(32);
  await db
    .update(oauthTokens)
    .set({ tokenHash: hash(accessToken), expiresAt: new Date(Date.now() + 3600_000) })
    .where(eq(oauthTokens.id, row.id));
  return { accessToken, expiresIn: 3600 };
}

export async function introspectToken(accessTokenPlain: string) {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.tokenHash, hash(accessTokenPlain)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt < new Date()) return { active: false };
  return {
    active: true,
    userId: row.userId,
    orgId: row.orgId,
    scopes: row.scopes,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function revokeToken(accessTokenPlain: string): Promise<void> {
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthTokens.tokenHash, hash(accessTokenPlain)));
}
