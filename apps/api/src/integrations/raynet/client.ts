/**
 * Raynet API client (#370/#391).
 *
 * Thin typed wrapper around Raynet's REST API. Load a connection with
 * `getConnection(orgId)`, then call the endpoint helpers.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { raynetConnections, type RaynetConnection } from '../../db/schema/raynet.js';
import { AppError } from '../../lib/app-error.js';
import {
  buildRaynetUrl,
  buildRaynetAuthHeader,
  normalizeRaynetContact,
  normalizeRaynetCompany,
  normalizeRaynetDeal,
  type RaynetNormalizedContact,
  type RaynetNormalizedCompany,
  type RaynetNormalizedDeal,
} from './pure.js';

export async function getConnection(orgId: string): Promise<RaynetConnection> {
  const [row] = await db
    .select()
    .from(raynetConnections)
    .where(eq(raynetConnections.orgId, orgId))
    .limit(1);
  if (!row) throw AppError.notFound('Raynet connection');
  return row;
}

/**
 * Register or replace the Raynet connection for an org. Does NOT validate
 * credentials — the caller should `testConnection()` before relying on it.
 */
export async function upsertConnection(input: {
  orgId: string;
  instanceName: string;
  username: string;
  apiKey: string;
}): Promise<RaynetConnection> {
  const [row] = await db
    .insert(raynetConnections)
    .values({
      orgId: input.orgId,
      instanceName: input.instanceName,
      username: input.username,
      apiKey: input.apiKey,
    })
    .onConflictDoUpdate({
      target: raynetConnections.orgId,
      set: {
        instanceName: input.instanceName,
        username: input.username,
        apiKey: input.apiKey,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

async function rnFetch<T = unknown>(
  conn: RaynetConnection,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = buildRaynetUrl(conn.instanceName, path);
  const headers = new Headers(init.headers);
  headers.set('Authorization', buildRaynetAuthHeader(conn.username, conn.apiKey));
  headers.set('X-Instance-Name', conn.instanceName);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw AppError.badRequest(`Raynet API ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function testConnection(
  conn: RaynetConnection,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await rnFetch(conn, '/ping');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export async function listContacts(
  conn: RaynetConnection,
  opts: { limit?: number; offset?: number } = {},
): Promise<RaynetNormalizedContact[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString() ? `?${params}` : '';
  const res = await rnFetch<{ data: Array<Record<string, unknown>> }>(conn, `/contacts${qs}`);
  return (res.data ?? []).map((row) => normalizeRaynetContact(row));
}

export async function getContact(
  conn: RaynetConnection,
  id: number,
): Promise<RaynetNormalizedContact> {
  const res = await rnFetch<Record<string, unknown>>(conn, `/contacts/${id}`);
  return normalizeRaynetContact(res);
}

export async function createContact(
  conn: RaynetConnection,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    companyId?: number;
  },
): Promise<RaynetNormalizedContact> {
  const contactInfo: Array<Record<string, unknown>> = [];
  if (input.email)
    contactInfo.push({ contactInfoType: 'email', contactInfo: input.email, primary: true });
  if (input.phone)
    contactInfo.push({ contactInfoType: 'tel', contactInfo: input.phone, primary: true });

  const res = await rnFetch<Record<string, unknown>>(conn, '/contacts', {
    method: 'POST',
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      contactInfo,
      ...(input.companyId ? { primaryAddress: { company: { id: input.companyId } } } : {}),
    }),
  });
  return normalizeRaynetContact(res);
}

// ─── Companies ───────────────────────────────────────────────────────────────

export async function listCompanies(
  conn: RaynetConnection,
  opts: { limit?: number; offset?: number } = {},
): Promise<RaynetNormalizedCompany[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString() ? `?${params}` : '';
  const res = await rnFetch<{ data: Array<Record<string, unknown>> }>(conn, `/companies${qs}`);
  return (res.data ?? []).map((row) => normalizeRaynetCompany(row));
}

export async function createCompany(
  conn: RaynetConnection,
  input: {
    name: string;
    ico?: string;
    dic?: string;
    street?: string;
    city?: string;
    zip?: string;
    country?: string;
  },
): Promise<RaynetNormalizedCompany> {
  const res = await rnFetch<Record<string, unknown>>(conn, '/companies', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      regNumber: input.ico,
      taxNumber: input.dic,
      primaryAddress: {
        street: input.street,
        city: input.city,
        zipCode: input.zip,
        state: input.country,
      },
    }),
  });
  return normalizeRaynetCompany(res);
}

// ─── Deals (Raynet businessCases) ────────────────────────────────────────────

export async function listDeals(
  conn: RaynetConnection,
  opts: { limit?: number; offset?: number } = {},
): Promise<RaynetNormalizedDeal[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString() ? `?${params}` : '';
  const res = await rnFetch<{ data: Array<Record<string, unknown>> }>(conn, `/businessCases${qs}`);
  return (res.data ?? []).map((row) => normalizeRaynetDeal(row));
}
