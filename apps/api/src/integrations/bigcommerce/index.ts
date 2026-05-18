/**
 * BigCommerce native integration adapter (#224).
 *
 * BigCommerce uses API key auth (store_hash + client_id + access_token) and
 * SHA256 HMAC webhook signatures.
 */

import {
  verifyBigCommerceWebhook,
  createConnection,
  testConnection,
} from '../../services/ecommerce/index.js';
import type { BigCommerceCredentials } from '../../db/schema/ecommerce-integrations.js';
import { AppError } from '../../lib/app-error.js';

const BC_API_BASE = (storeHash: string) => `https://api.bigcommerce.com/stores/${storeHash}/v2`;
const BC_V3_BASE = (storeHash: string) => `https://api.bigcommerce.com/stores/${storeHash}/v3`;

// ─── Connection setup ─────────────────────────────────────────────────────────

export async function connect(
  orgId: string,
  input: { storeHash: string; clientId: string; clientSecret: string; accessToken: string; name?: string; webhookSecret?: string },
): Promise<{ connectionId: string }> {
  const credentials: BigCommerceCredentials = {
    storeHash: input.storeHash,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    accessToken: input.accessToken,
    webhookSecret: input.webhookSecret,
  };

  const conn = await createConnection(orgId, {
    platform: 'bigcommerce',
    name: input.name ?? `BC:${input.storeHash}`,
    credentials,
  });
  return { connectionId: conn.id };
}

// ─── Webhook handling ─────────────────────────────────────────────────────────

export { verifyBigCommerceWebhook };

// ─── REST API helpers ─────────────────────────────────────────────────────────

async function bcFetch(storeHash: string, clientId: string, accessToken: string, path: string) {
  const res = await fetch(`${BC_V3_BASE(storeHash)}${path}`, {
    headers: {
      'X-Auth-Token': accessToken,
      'X-Auth-Client': clientId,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw AppError.badRequest(`BigCommerce API ${res.status}`);
  return res.json();
}

export async function fetchProducts(storeHash: string, clientId: string, accessToken: string, page = 1, limit = 50) {
  return bcFetch(storeHash, clientId, accessToken, `/catalog/products?page=${page}&limit=${limit}&include=variants,images`);
}

export async function fetchOrders(storeHash: string, clientId: string, accessToken: string, page = 1, limit = 50) {
  const res = await fetch(`${BC_API_BASE(storeHash)}/orders?page=${page}&limit=${limit}&sort=date_created:desc`, {
    headers: { 'X-Auth-Token': accessToken, 'X-Auth-Client': clientId },
  });
  if (!res.ok) throw AppError.badRequest(`BigCommerce API ${res.status}`);
  return res.json();
}

export async function fetchCustomers(storeHash: string, clientId: string, accessToken: string, page = 1, limit = 50) {
  return bcFetch(storeHash, clientId, accessToken, `/customers?page=${page}&limit=${limit}`);
}

export async function registerWebhooks(storeHash: string, clientId: string, accessToken: string, deliveryUrl: string) {
  const scopes = ['store/order/created', 'store/order/updated', 'store/customer/created'];
  const results = [];
  for (const scope of scopes) {
    const res = await fetch(`${BC_V3_BASE(storeHash)}/hooks`, {
      method: 'POST',
      headers: { 'X-Auth-Token': accessToken, 'X-Auth-Client': clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, destination: deliveryUrl, is_active: true, headers: {} }),
    });
    if (res.ok) results.push(await res.json());
  }
  return results;
}

export { testConnection };
