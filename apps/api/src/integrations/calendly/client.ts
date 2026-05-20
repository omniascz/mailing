/**
 * Calendly OAuth v2 + REST API v2 client.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { calendlyConnections, type CalendlyConnection } from '../../db/schema/calendly.js';
import { AppError } from '../../lib/app-error.js';

const BASE = 'https://api.calendly.com';
const TOKEN_URL = 'https://auth.calendly.com/oauth/token';

export async function getConnection(orgId: string): Promise<CalendlyConnection> {
  const [row] = await db
    .select()
    .from(calendlyConnections)
    .where(eq(calendlyConnections.orgId, orgId))
    .limit(1);
  if (!row) throw AppError.notFound('Calendly connection');
  return row;
}

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL('https://auth.calendly.com/oauth/authorize');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);
  return url.toString();
}

export async function exchangeCode(input: {
  orgId: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<CalendlyConnection> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw AppError.badRequest(`Calendly token exchange failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    owner?: string;
    organization?: string;
  };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

  const [row] = await db
    .insert(calendlyConnections)
    .values({
      orgId: input.orgId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      tokenExpiresAt: expiresAt,
      userUri: data.owner ?? null,
      organizationUri: data.organization ?? null,
    })
    .onConflictDoUpdate({
      target: calendlyConnections.orgId,
      set: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        userUri: data.owner ?? null,
        organizationUri: data.organization ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

async function refreshAccessToken(
  conn: CalendlyConnection,
  clientId: string,
  clientSecret: string,
): Promise<CalendlyConnection> {
  if (!conn.refreshToken) throw AppError.badRequest('Calendly connection has no refresh token');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw AppError.badRequest(`Calendly token refresh failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  const [row] = await db
    .update(calendlyConnections)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? conn.refreshToken,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(calendlyConnections.orgId, conn.orgId))
    .returning();
  return row!;
}

export async function calendlyFetch<T = unknown>(
  conn: CalendlyConnection,
  path: string,
  init: RequestInit = {},
  creds?: { clientId: string; clientSecret: string },
): Promise<T> {
  if (conn.tokenExpiresAt && creds && conn.tokenExpiresAt.getTime() - Date.now() < 300_000) {
    conn = await refreshAccessToken(conn, creds.clientId, creds.clientSecret);
  }
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${conn.accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && creds) {
    const refreshed = await refreshAccessToken(conn, creds.clientId, creds.clientSecret);
    return calendlyFetch<T>(refreshed, path, init);
  }
  if (!res.ok) {
    const text = await res.text();
    throw AppError.badRequest(`Calendly API ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

// ─── Webhook management ───────────────────────────────────────────────────────

export interface CalendlyWebhookSubscription {
  uri: string;
  callback_url: string;
  events: string[];
  state: string;
}

export async function createWebhook(
  conn: CalendlyConnection,
  callbackUrl: string,
  signingKey: string,
): Promise<CalendlyWebhookSubscription> {
  if (!conn.organizationUri) throw AppError.badRequest('Calendly organization URI not set');
  const result = await calendlyFetch<{ resource: CalendlyWebhookSubscription }>(
    conn,
    '/webhook_subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        url: callbackUrl,
        events: ['invitee.created', 'invitee.canceled'],
        organization: conn.organizationUri,
        user: conn.userUri ?? undefined,
        scope: conn.userUri ? 'user' : 'organization',
        signing_key: signingKey,
      }),
    },
  );
  return result.resource;
}
