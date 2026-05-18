/**
 * Shopify native integration adapter (#224).
 *
 * Thin wrapper over the shared ecommerce service that provides a clean,
 * Shopify-specific API surface: OAuth install flow, webhook registration,
 * signature verification, and contact/order sync.
 */

import {
  buildShopifyInstallUrl,
  exchangeShopifyCode,
  registerShopifyWebhooks,
  verifyShopifyWebhook,
  createConnection,
} from '../../services/ecommerce/index.js';
import type { ShopifyCredentials } from '../../db/schema/ecommerce-integrations.js';

// ─── OAuth install flow ───────────────────────────────────────────────────────

export function getInstallUrl(shopDomain: string, state: string): string {
  return buildShopifyInstallUrl(shopDomain, state);
}

export async function completeOAuth(
  orgId: string,
  shopDomain: string,
  code: string,
  connectionName?: string,
): Promise<{ connectionId: string }> {
  const { accessToken, scope } = await exchangeShopifyCode(shopDomain, code);
  await registerShopifyWebhooks(shopDomain, accessToken);

  const credentials: ShopifyCredentials = {
    shopDomain,
    accessToken,
    scopes: scope.split(','),
  };

  const conn = await createConnection(orgId, {
    platform: 'shopify',
    name: connectionName ?? shopDomain,
    credentials,
  });
  return { connectionId: conn.id };
}

// ─── Webhook handling ─────────────────────────────────────────────────────────

export { verifyShopifyWebhook };

// ─── REST API helpers ─────────────────────────────────────────────────────────

export async function fetchShopifyProducts(shopDomain: string, accessToken: string, limit = 50) {
  const res = await fetch(
    `https://${shopDomain}/admin/api/2024-01/products.json?limit=${limit}&fields=id,title,variants,images`,
    { headers: { 'X-Shopify-Access-Token': accessToken } },
  );
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const data = (await res.json()) as { products: unknown[] };
  return data.products;
}

export async function fetchShopifyCustomer(shopDomain: string, accessToken: string, customerId: string) {
  const res = await fetch(
    `https://${shopDomain}/admin/api/2024-01/customers/${customerId}.json`,
    { headers: { 'X-Shopify-Access-Token': accessToken } },
  );
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const data = (await res.json()) as { customer: unknown };
  return data.customer;
}

export async function fetchShopifyOrders(shopDomain: string, accessToken: string, sinceId?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit), status: 'any' });
  if (sinceId) params.set('since_id', sinceId);
  const res = await fetch(
    `https://${shopDomain}/admin/api/2024-01/orders.json?${params}`,
    { headers: { 'X-Shopify-Access-Token': accessToken } },
  );
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const data = (await res.json()) as { orders: unknown[] };
  return data.orders;
}
