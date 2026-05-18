/**
 * Thin Salesforce REST client. Handles OAuth refresh transparently and exposes
 * the SObject endpoints we need (Contact, Account, Opportunity).
 *
 * We intentionally don't pull jsforce — it bundles a kitchen sink that we'd
 * never use, and we want the connection state to live in our DB rather than
 * jsforce's in-memory session.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { salesforceConnections, type SalesforceConnection } from '../../db/schema/salesforce.js';
import { AppError } from '../../lib/app-error.js';

export interface SfQueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

const TOKEN_URL = (loginHost: string) => `${loginHost}/services/oauth2/token`;
const DEFAULT_LOGIN_HOST = 'https://login.salesforce.com';

export async function getConnection(orgId: string): Promise<SalesforceConnection> {
  const [row] = await db.select().from(salesforceConnections).where(eq(salesforceConnections.orgId, orgId)).limit(1);
  if (!row) throw AppError.notFound('Salesforce connection');
  return row;
}

/** Build the consent URL for the OAuth Web Server flow. */
export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHost?: string;
  scopes?: string[];
}): string {
  const host = input.loginHost ?? DEFAULT_LOGIN_HOST;
  const scopes = (input.scopes ?? ['api', 'refresh_token', 'offline_access']).join(' ');
  const url = new URL(`${host}/services/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', input.state);
  return url.toString();
}

/** Exchange the OAuth code for tokens, then upsert the connection row. */
export async function exchangeCode(input: {
  orgId: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  loginHost?: string;
}): Promise<SalesforceConnection> {
  const host = input.loginHost ?? DEFAULT_LOGIN_HOST;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const res = await fetch(TOKEN_URL(host), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw AppError.badRequest(`Salesforce token exchange failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    instance_url: string;
    id?: string;
    issued_at?: string;
  };
  // id format: https://login.salesforce.com/id/<orgId>/<userId>
  const idParts = (data.id ?? '').split('/').slice(-2);
  const [row] = await db
    .insert(salesforceConnections)
    .values({
      orgId: input.orgId,
      instanceUrl: data.instance_url,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      salesforceOrgId: idParts[0] ?? null,
      salesforceUserId: idParts[1] ?? null,
    })
    .onConflictDoUpdate({
      target: salesforceConnections.orgId,
      set: {
        instanceUrl: data.instance_url,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        salesforceOrgId: idParts[0] ?? null,
        salesforceUserId: idParts[1] ?? null,
        tokenIssuedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

async function refreshAccessToken(
  conn: SalesforceConnection,
  clientId: string,
  clientSecret: string,
): Promise<SalesforceConnection> {
  if (!conn.refreshToken) throw AppError.badRequest('Salesforce connection has no refresh token; reauthorize required');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  // The token endpoint host should match the original login host; instance_url is the API base, not the auth host.
  const res = await fetch(TOKEN_URL(DEFAULT_LOGIN_HOST), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw AppError.badRequest(`Salesforce token refresh failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; instance_url?: string };
  const [row] = await db
    .update(salesforceConnections)
    .set({
      accessToken: data.access_token,
      instanceUrl: data.instance_url ?? conn.instanceUrl,
      tokenIssuedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(salesforceConnections.orgId, conn.orgId))
    .returning();
  return row!;
}

/** Internal request helper with one-shot 401 → refresh → retry. */
export async function sfFetch<T = unknown>(
  conn: SalesforceConnection,
  path: string,
  init: RequestInit = {},
  creds?: { clientId: string; clientSecret: string },
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${conn.instanceUrl}/services/data/${conn.apiVersion}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${conn.accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && creds) {
    const refreshed = await refreshAccessToken(conn, creds.clientId, creds.clientSecret);
    return sfFetch<T>(refreshed, path, init);
  }
  if (!res.ok) {
    const text = await res.text();
    throw AppError.badRequest(`Salesforce API ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ─── Typed wrappers we actually use ──────────────────────────────────────────

export interface SfContactRecord {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  AccountId?: string;
  LastModifiedDate?: string;
}

export interface SfAccountRecord {
  Id: string;
  Name: string;
  Website?: string;
  Industry?: string;
  AnnualRevenue?: number;
  NumberOfEmployees?: number;
  ParentId?: string;
  LastModifiedDate?: string;
}

export interface SfOpportunityRecord {
  Id: string;
  Name: string;
  StageName: string;
  Amount?: number;
  CloseDate?: string;
  AccountId?: string;
  IsClosed?: boolean;
  IsWon?: boolean;
  LastModifiedDate?: string;
}

export async function queryContacts(conn: SalesforceConnection, sinceIso?: string, limit = 200): Promise<SfQueryResult<SfContactRecord>> {
  const where = sinceIso ? `WHERE LastModifiedDate > ${sinceIso}` : '';
  const soql = `SELECT Id,FirstName,LastName,Email,Phone,AccountId,LastModifiedDate FROM Contact ${where} ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
  return sfFetch<SfQueryResult<SfContactRecord>>(conn, `/query?q=${encodeURIComponent(soql)}`);
}

export async function queryAccounts(conn: SalesforceConnection, sinceIso?: string, limit = 200): Promise<SfQueryResult<SfAccountRecord>> {
  const where = sinceIso ? `WHERE LastModifiedDate > ${sinceIso}` : '';
  const soql = `SELECT Id,Name,Website,Industry,AnnualRevenue,NumberOfEmployees,ParentId,LastModifiedDate FROM Account ${where} ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
  return sfFetch<SfQueryResult<SfAccountRecord>>(conn, `/query?q=${encodeURIComponent(soql)}`);
}

export async function queryOpportunities(conn: SalesforceConnection, sinceIso?: string, limit = 200): Promise<SfQueryResult<SfOpportunityRecord>> {
  const where = sinceIso ? `WHERE LastModifiedDate > ${sinceIso}` : '';
  const soql = `SELECT Id,Name,StageName,Amount,CloseDate,AccountId,IsClosed,IsWon,LastModifiedDate FROM Opportunity ${where} ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
  return sfFetch<SfQueryResult<SfOpportunityRecord>>(conn, `/query?q=${encodeURIComponent(soql)}`);
}

export async function upsertContact(conn: SalesforceConnection, body: Partial<SfContactRecord>, externalId?: { field: string; value: string }): Promise<{ id: string }> {
  if (externalId) {
    const path = `/sobjects/Contact/${externalId.field}/${encodeURIComponent(externalId.value)}`;
    const res = await sfFetch<{ id: string }>(conn, path, { method: 'PATCH', body: JSON.stringify(body) });
    return res;
  }
  if (body.Id) {
    await sfFetch(conn, `/sobjects/Contact/${body.Id}`, { method: 'PATCH', body: JSON.stringify({ ...body, Id: undefined }) });
    return { id: body.Id };
  }
  return sfFetch<{ id: string }>(conn, '/sobjects/Contact', { method: 'POST', body: JSON.stringify(body) });
}

export async function upsertAccount(conn: SalesforceConnection, body: Partial<SfAccountRecord>): Promise<{ id: string }> {
  if (body.Id) {
    await sfFetch(conn, `/sobjects/Account/${body.Id}`, { method: 'PATCH', body: JSON.stringify({ ...body, Id: undefined }) });
    return { id: body.Id };
  }
  return sfFetch<{ id: string }>(conn, '/sobjects/Account', { method: 'POST', body: JSON.stringify(body) });
}

export async function upsertOpportunity(conn: SalesforceConnection, body: Partial<SfOpportunityRecord>): Promise<{ id: string }> {
  if (body.Id) {
    await sfFetch(conn, `/sobjects/Opportunity/${body.Id}`, { method: 'PATCH', body: JSON.stringify({ ...body, Id: undefined }) });
    return { id: body.Id };
  }
  return sfFetch<{ id: string }>(conn, '/sobjects/Opportunity', { method: 'POST', body: JSON.stringify(body) });
}
