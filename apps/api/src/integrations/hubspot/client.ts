/**
 * HubSpot CRM v3 client.
 * Handles OAuth token refresh transparently and exposes the endpoints we need:
 * contacts (search, get, create/update), deals (search, get, create/update).
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { hubspotConnections, type HubspotConnection } from '../../db/schema/hubspot.js';
import { AppError } from '../../lib/app-error.js';

const BASE = 'https://api.hubapi.com';
const TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

export async function getConnection(orgId: string): Promise<HubspotConnection> {
  const [row] = await db
    .select()
    .from(hubspotConnections)
    .where(eq(hubspotConnections.orgId, orgId))
    .limit(1);
  if (!row) throw AppError.notFound('HubSpot connection');
  return row;
}

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const scopes = (
    input.scopes ?? [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
    ]
  ).join(' ');
  const url = new URL('https://app.hubspot.com/oauth/authorize');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', input.state);
  return url.toString();
}

export async function exchangeCode(input: {
  orgId: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<HubspotConnection> {
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
  if (!res.ok) throw AppError.badRequest(`HubSpot token exchange failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    hub_id?: number;
    hub_domain?: string;
  };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  const [row] = await db
    .insert(hubspotConnections)
    .values({
      orgId: input.orgId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      tokenExpiresAt: expiresAt,
      hubId: data.hub_id ? String(data.hub_id) : null,
      hubDomain: data.hub_domain ?? null,
      scopes: [],
    })
    .onConflictDoUpdate({
      target: hubspotConnections.orgId,
      set: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        hubId: data.hub_id ? String(data.hub_id) : null,
        hubDomain: data.hub_domain ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

async function refreshAccessToken(
  conn: HubspotConnection,
  clientId: string,
  clientSecret: string,
): Promise<HubspotConnection> {
  if (!conn.refreshToken)
    throw AppError.badRequest('HubSpot connection has no refresh token; reauthorize required');
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
  if (!res.ok) throw AppError.badRequest(`HubSpot token refresh failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  const [row] = await db
    .update(hubspotConnections)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? conn.refreshToken,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(hubspotConnections.orgId, conn.orgId))
    .returning();
  return row!;
}

export async function hsFetch<T = unknown>(
  conn: HubspotConnection,
  path: string,
  init: RequestInit = {},
  creds?: { clientId: string; clientSecret: string },
): Promise<T> {
  // Proactively refresh if token expires in < 5 min
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
    return hsFetch<T>(refreshed, path, init);
  }
  if (!res.ok) {
    const text = await res.text();
    throw AppError.badRequest(`HubSpot API ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export interface HsContactProperties {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  [key: string]: string | undefined;
}

export interface HsContact {
  id: string;
  properties: HsContactProperties;
  updatedAt?: string;
}

export interface HsDealProperties {
  dealname?: string;
  amount?: string;
  dealstage?: string;
  pipeline?: string;
  closedate?: string;
  [key: string]: string | undefined;
}

export interface HsDeal {
  id: string;
  properties: HsDealProperties;
  updatedAt?: string;
}

export async function searchContacts(conn: HubspotConnection, email: string): Promise<HsContact[]> {
  const body = JSON.stringify({
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
    limit: 10,
  });
  const result = await hsFetch<{ results: HsContact[] }>(conn, '/crm/v3/objects/contacts/search', {
    method: 'POST',
    body,
  });
  return result.results;
}

export async function upsertContact(
  conn: HubspotConnection,
  props: HsContactProperties,
): Promise<HsContact> {
  if (!props.email) throw AppError.badRequest('HubSpot contact upsert requires email');
  const body = JSON.stringify({ properties: props });
  return hsFetch<HsContact>(conn, '/crm/v3/objects/contacts', { method: 'POST', body });
}

export async function updateContact(
  conn: HubspotConnection,
  hsContactId: string,
  props: HsContactProperties,
): Promise<HsContact> {
  return hsFetch<HsContact>(conn, `/crm/v3/objects/contacts/${hsContactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: props }),
  });
}

export async function getRecentContacts(
  conn: HubspotConnection,
  after?: string,
  limit = 100,
): Promise<{ results: HsContact[]; paging?: { next?: { after: string } } }> {
  const params = new URLSearchParams({
    limit: String(limit),
    properties: 'email,firstname,lastname,phone,company',
  });
  if (after) params.set('after', after);
  return hsFetch(conn, `/crm/v3/objects/contacts?${params}`);
}

export async function createDeal(
  conn: HubspotConnection,
  props: HsDealProperties,
): Promise<HsDeal> {
  return hsFetch<HsDeal>(conn, '/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({ properties: props }),
  });
}

export async function updateDeal(
  conn: HubspotConnection,
  hsDealId: string,
  props: HsDealProperties,
): Promise<HsDeal> {
  return hsFetch<HsDeal>(conn, `/crm/v3/objects/deals/${hsDealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: props }),
  });
}

export async function getRecentDeals(
  conn: HubspotConnection,
  after?: string,
  limit = 100,
): Promise<{ results: HsDeal[]; paging?: { next?: { after: string } } }> {
  const params = new URLSearchParams({
    limit: String(limit),
    properties: 'dealname,amount,dealstage,pipeline,closedate',
  });
  if (after) params.set('after', after);
  return hsFetch(conn, `/crm/v3/objects/deals?${params}`);
}

export async function associateContactToDeal(
  conn: HubspotConnection,
  hsContactId: string,
  hsDealId: string,
): Promise<void> {
  await hsFetch(conn, `/crm/v4/objects/contacts/${hsContactId}/associations/deals/${hsDealId}`, {
    method: 'PUT',
    body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]),
  });
}
