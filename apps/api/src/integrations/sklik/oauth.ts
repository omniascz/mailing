/**
 * Sklik OAuth 2.0 flow (#420).
 *
 * Uses the standard authorization-code flow on Seznam's identity service.
 * Tokens are persisted to `ad_accounts` with platform=`sklik` so the rest of
 * the app (audience-sync, reporting) can call Sklik via a single Bearer token.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adAccounts, type AdPlatform } from '../../db/schema/ad-accounts.js';
import { AppError } from '../../lib/app-error.js';
import {
  buildAuthorizeUrl,
  encodeForm,
  isValidRedirectUri,
  normaliseTokenResponse,
  shouldRefresh,
  SKLIK_OAUTH_TOKEN_URL,
  type AuthorizeUrlInput,
} from './pure.js';

export const SKLIK_PLATFORM: AdPlatform = 'sklik';

export interface SklikOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Build the URL the browser should redirect to in order to start the flow. */
export function authorizeUrl(input: AuthorizeUrlInput): string {
  if (!isValidRedirectUri(input.redirectUri)) {
    throw AppError.badRequest('redirectUri must be https (or http://localhost in dev)');
  }
  return buildAuthorizeUrl(input);
}

/**
 * Exchange an authorization code for tokens and persist a fresh `ad_accounts`
 * row. Returns the inserted row.
 */
export async function exchangeCode(input: {
  orgId: string;
  code: string;
  config: SklikOAuthConfig;
  accountId: string;
  accountName?: string;
}): Promise<{ id: string; expiresAt: Date | null }> {
  const body = encodeForm({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
  });

  const res = await fetch(SKLIK_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw AppError.badRequest(`Sklik token exchange failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const token = normaliseTokenResponse(json);

  const [row] = await db
    .insert(adAccounts)
    .values({
      orgId: input.orgId,
      platform: SKLIK_PLATFORM,
      platformAccountId: input.accountId,
      accountName: input.accountName,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
      active: true,
      metadata: { scopes: token.scopes },
    })
    .onConflictDoUpdate({
      target: [adAccounts.orgId, adAccounts.platform, adAccounts.platformAccountId],
      set: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: token.expiresAt,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning({ id: adAccounts.id, tokenExpiresAt: adAccounts.tokenExpiresAt });

  if (!row) throw AppError.internal('Failed to persist Sklik OAuth tokens');
  return { id: row.id, expiresAt: row.tokenExpiresAt };
}

/**
 * Refresh tokens for an existing connection. No-ops if the token is still
 * fresh enough (per `shouldRefresh`). Returns the live access token.
 */
export async function ensureFreshAccessToken(
  orgId: string,
  platformAccountId: string,
  config: SklikOAuthConfig,
): Promise<string> {
  const [row] = await db
    .select()
    .from(adAccounts)
    .where(
      and(
        eq(adAccounts.orgId, orgId),
        eq(adAccounts.platform, SKLIK_PLATFORM),
        eq(adAccounts.platformAccountId, platformAccountId),
      ),
    )
    .limit(1);
  if (!row) throw AppError.notFound('Sklik connection not found');

  if (!shouldRefresh(row.tokenExpiresAt)) return row.accessToken;
  if (!row.refreshToken) {
    throw AppError.badRequest('Sklik connection has no refresh_token; user must re-authorize');
  }

  const body = encodeForm({
    grant_type: 'refresh_token',
    refresh_token: row.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetch(SKLIK_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw AppError.badRequest(`Sklik token refresh failed (${res.status}): ${text}`);
  }
  const token = normaliseTokenResponse(await res.json());

  await db
    .update(adAccounts)
    .set({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? row.refreshToken,
      tokenExpiresAt: token.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(adAccounts.id, row.id));

  return token.accessToken;
}

/** Revoke a Sklik connection by deactivating the row (no token-revoke API call). */
export async function disconnect(orgId: string, platformAccountId: string): Promise<void> {
  await db
    .update(adAccounts)
    .set({ active: false, accessToken: '', refreshToken: null, updatedAt: new Date() })
    .where(
      and(
        eq(adAccounts.orgId, orgId),
        eq(adAccounts.platform, SKLIK_PLATFORM),
        eq(adAccounts.platformAccountId, platformAccountId),
      ),
    );
}
