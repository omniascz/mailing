/**
 * Upgates integration adapter (#367/#390).
 *
 * Upgates is a major CZ e-shop platform. Unlike Shoptet (OAuth) it uses
 * API-key Basic-auth against a per-eshop admin subdomain
 * `{slug}.admin.upgates.com/api/v2/…`.
 *
 * Env: no global env vars needed — each connection stores its own
 *      `apiLogin` + `apiKey`.
 */

import { AppError } from '../../lib/app-error.js';
import { createConnection, ingestOrder, getConnection } from '../../services/ecommerce/index.js';
import type {
  UpgatesCredentials,
  EcommerceConnection,
} from '../../db/schema/ecommerce-integrations.js';
import {
  verifyUpgatesWebhookSignature,
  normalizeUpgatesOrderPayload,
  normalizeUpgatesAdminUrl,
  buildUpgatesAuthHeader,
} from './pure.js';

export { verifyUpgatesWebhookSignature, normalizeUpgatesOrderPayload, normalizeUpgatesAdminUrl };

// ─── Connection install ──────────────────────────────────────────────────────

/**
 * Register an Upgates connection. Upgates uses API-key Basic-auth, so there
 * is no OAuth dance — the admin provides the login + key directly.
 */
export async function registerConnection(
  orgId: string,
  input: {
    adminUrl: string;
    apiLogin: string;
    apiKey: string;
    webhookSecret?: string;
    name?: string;
  },
): Promise<{ connectionId: string }> {
  const adminUrl = normalizeUpgatesAdminUrl(input.adminUrl);

  // Validate credentials by hitting `/api/v2/eshop` (lightweight ping)
  const res = await fetch(`${adminUrl}/api/v2/eshop`, {
    headers: { Authorization: buildUpgatesAuthHeader(input.apiLogin, input.apiKey), Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new AppError({
      code: 'UPGATES_AUTH_FAILED',
      message: `Upgates API returned ${res.status} during credential check`,
      statusCode: 400,
    });
  }

  const credentials: UpgatesCredentials = {
    adminUrl,
    apiLogin: input.apiLogin,
    apiKey: input.apiKey,
    ...(input.webhookSecret ? { webhookSecret: input.webhookSecret } : {}),
  };

  const conn = await createConnection(orgId, {
    platform: 'upgates',
    name: input.name ?? displayName(adminUrl),
    credentials,
  });
  return { connectionId: conn.id };
}

// ─── Webhook handling ────────────────────────────────────────────────────────

export async function handleWebhookEvent(
  connection: EcommerceConnection,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const orderTopics = new Set([
    'order.created',
    'order.updated',
    'order/create',
    'order/update',
  ]);
  if (orderTopics.has(topic)) {
    const order = normalizeUpgatesOrderPayload(payload);
    await ingestOrder(connection, order);
  }
}

// ─── REST API helpers ────────────────────────────────────────────────────────

export async function fetchUpgatesOrders(
  creds: UpgatesCredentials,
  opts: { page?: number; pageSize?: number } = {},
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('limit', String(opts.pageSize));
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${creds.adminUrl}/api/v2/orders${qs}`, {
    headers: {
      Authorization: buildUpgatesAuthHeader(creds.apiLogin, creds.apiKey),
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Upgates API ${res.status}`);
  const data = (await res.json()) as { orders?: unknown[] };
  return data.orders ?? [];
}

export async function fetchUpgatesCustomers(
  creds: UpgatesCredentials,
  opts: { page?: number; pageSize?: number } = {},
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('limit', String(opts.pageSize));
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${creds.adminUrl}/api/v2/customers${qs}`, {
    headers: {
      Authorization: buildUpgatesAuthHeader(creds.apiLogin, creds.apiKey),
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Upgates API ${res.status}`);
  const data = (await res.json()) as { customers?: unknown[] };
  return data.customers ?? [];
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function displayName(adminUrl: string): string {
  try {
    return new URL(adminUrl).hostname;
  } catch {
    return adminUrl;
  }
}

export async function getUpgatesConnection(
  orgId: string,
  connectionId: string,
): Promise<EcommerceConnection & { credentials: UpgatesCredentials }> {
  const conn = await getConnection(orgId, connectionId);
  if (conn.platform !== 'upgates') {
    throw new Error(`Connection ${connectionId} is not an Upgates connection`);
  }
  return conn as EcommerceConnection & { credentials: UpgatesCredentials };
}
