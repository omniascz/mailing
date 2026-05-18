/**
 * Shoptet native integration adapter (#366/#386).
 *
 * Shoptet is the dominant e-shop platform in CZ (~40% market share) and a
 * must-have for the CZ-first launch (see §18-B of TODO.md). This module is
 * a thin wrapper over `services/ecommerce` providing a Shoptet-flavored
 * surface: OAuth install flow, webhook signature verification, order
 * normalization, and basic REST helpers for fetching orders & customers.
 *
 * Docs: https://developer.shoptet.com — endpoint paths and webhook topic
 * names may change per partner-portal configuration. Env vars:
 *   SHOPTET_CLIENT_ID / SHOPTET_CLIENT_SECRET — partner credentials
 *   SHOPTET_OAUTH_BASE (optional)            — OAuth host override
 *   API_BASE_URL                              — used for callback/webhook URLs
 */

import {
  buildShoptetAuthorizeUrl,
  exchangeShoptetCode,
  refreshShoptetToken,
  verifyShoptetWebhook,
  normalizeShoptetOrder,
  createConnection,
  ingestOrder,
  getConnection,
} from '../../services/ecommerce/index.js';
import type {
  ShoptetCredentials,
  EcommerceConnection,
} from '../../db/schema/ecommerce-integrations.js';

// ─── OAuth install flow ──────────────────────────────────────────────────────

export function getInstallUrl(eshopUrl: string, state: string): string {
  return buildShoptetAuthorizeUrl(normalizeEshopUrl(eshopUrl), state);
}

export async function completeOAuth(
  orgId: string,
  eshopUrl: string,
  code: string,
  connectionName?: string,
): Promise<{ connectionId: string }> {
  const normalizedUrl = normalizeEshopUrl(eshopUrl);
  const tokens = await exchangeShoptetCode(normalizedUrl, code);

  const credentials: ShoptetCredentials = {
    eshopUrl: normalizedUrl,
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    ...(tokens.expiresIn
      ? { accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn }
      : {}),
    ...(tokens.scope ? { scopes: tokens.scope.split(' ') } : {}),
  };

  const conn = await createConnection(orgId, {
    platform: 'shoptet',
    name: connectionName ?? displayName(normalizedUrl),
    credentials,
  });
  return { connectionId: conn.id };
}

// ─── Webhook handling ────────────────────────────────────────────────────────

export { verifyShoptetWebhook, normalizeShoptetOrder };

/**
 * Handle an inbound Shoptet webhook payload. Caller is responsible for
 * verifying the signature first via `verifyShoptetWebhook`. Dispatches
 * order-creation / order-update events into the shared ingestion path.
 */
export async function handleWebhookEvent(
  connection: EcommerceConnection,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const orderTopics = new Set([
    'order/create',
    'order/update',
    'order.create',
    'order.update',
    'order_created',
    'order_updated',
  ]);
  if (orderTopics.has(topic)) {
    const order = normalizeShoptetOrder(payload);
    await ingestOrder(connection, order);
    return;
  }
  // Other webhook topics (customer/*, cart/abandoned, subscriber/*, product/*)
  // are parked for future phases. Logged-and-dropped for now.
}

// ─── REST API helpers ────────────────────────────────────────────────────────

export async function fetchShoptetOrders(
  creds: ShoptetCredentials,
  opts: { page?: number; pageSize?: number } = {},
): Promise<unknown[]> {
  const { accessToken } = await ensureFreshAccessToken(creds);
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('itemsPerPage', String(opts.pageSize));
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${creds.eshopUrl}/action/ApiExportOrders${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Shoptet API ${res.status}`);
  const data = (await res.json()) as { data?: { orders?: unknown[] } };
  return data.data?.orders ?? [];
}

export async function fetchShoptetCustomers(
  creds: ShoptetCredentials,
  opts: { page?: number; pageSize?: number } = {},
): Promise<unknown[]> {
  const { accessToken } = await ensureFreshAccessToken(creds);
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.pageSize) params.set('itemsPerPage', String(opts.pageSize));
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${creds.eshopUrl}/action/ApiExportCustomers${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Shoptet API ${res.status}`);
  const data = (await res.json()) as { data?: { customers?: unknown[] } };
  return data.data?.customers ?? [];
}

// ─── Token lifecycle ─────────────────────────────────────────────────────────

/**
 * Return an access token, refreshing via the stored refresh token when
 * the current token is within 60s of expiry. Does NOT persist the new
 * token — callers that hold connection rows should update `credentials`
 * themselves after calling this.
 */
export async function ensureFreshAccessToken(
  creds: ShoptetCredentials,
): Promise<{ accessToken: string; refreshed: boolean; expiresAt?: number; refreshToken?: string }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = creds.accessTokenExpiresAt;
  const needsRefresh = creds.refreshToken && expiresAt !== undefined && expiresAt - now < 60;

  if (!needsRefresh) {
    return {
      accessToken: creds.accessToken,
      refreshed: false,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
  }

  const refreshed = await refreshShoptetToken(creds.refreshToken as string);
  return {
    accessToken: refreshed.accessToken,
    refreshed: true,
    ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    ...(refreshed.expiresIn
      ? { expiresAt: Math.floor(Date.now() / 1000) + refreshed.expiresIn }
      : {}),
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Strip trailing slashes and lowercase the host portion of the eshop URL so
 * equality checks and tokens are stable.
 */
export function normalizeEshopUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '');
    // Drop trailing slash on origin (URL string form always keeps a '/')
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return withProtocol.replace(/\/+$/, '');
  }
}

function displayName(eshopUrl: string): string {
  try {
    return new URL(eshopUrl).hostname;
  } catch {
    return eshopUrl;
  }
}

/**
 * Load a Shoptet connection row (scoped by org) and assert the platform
 * type. Thin typed wrapper around the shared `getConnection` helper.
 */
export async function getShoptetConnection(
  orgId: string,
  connectionId: string,
): Promise<EcommerceConnection & { credentials: ShoptetCredentials }> {
  const conn = await getConnection(orgId, connectionId);
  if (conn.platform !== 'shoptet') {
    throw new Error(`Connection ${connectionId} is not a Shoptet connection`);
  }
  return conn as EcommerceConnection & { credentials: ShoptetCredentials };
}
