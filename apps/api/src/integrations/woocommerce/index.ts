/**
 * WooCommerce native integration adapter (#224).
 *
 * WooCommerce uses REST API key auth (consumer_key / consumer_secret) and
 * HMAC-SHA256 webhook signatures.
 */

import {
  verifyWooCommerceWebhook,
  createConnection,
  testConnection,
} from '../../services/ecommerce/index.js';
import type { WooCommerceCredentials } from '../../db/schema/ecommerce-integrations.js';
import { AppError } from '../../lib/app-error.js';

// ─── Connection setup ─────────────────────────────────────────────────────────

export async function connect(
  orgId: string,
  input: { storeUrl: string; consumerKey: string; consumerSecret: string; name?: string; webhookSecret?: string },
): Promise<{ connectionId: string }> {
  const credentials: WooCommerceCredentials = {
    storeUrl: input.storeUrl.replace(/\/$/, ''),
    consumerKey: input.consumerKey,
    consumerSecret: input.consumerSecret,
    webhookSecret: input.webhookSecret,
  };

  const conn = await createConnection(orgId, {
    platform: 'woocommerce',
    name: input.name ?? new URL(input.storeUrl).hostname,
    credentials,
  });
  return { connectionId: conn.id };
}

// ─── Webhook handling ─────────────────────────────────────────────────────────

export { verifyWooCommerceWebhook };

// ─── REST API helpers ─────────────────────────────────────────────────────────

async function wcFetch(storeUrl: string, consumerKey: string, consumerSecret: string, endpoint: string) {
  const url = new URL(`${storeUrl}/wp-json/wc/v3/${endpoint}`);
  url.searchParams.set('consumer_key', consumerKey);
  url.searchParams.set('consumer_secret', consumerSecret);
  const res = await fetch(url.toString());
  if (!res.ok) throw AppError.badRequest(`WooCommerce API ${res.status}`);
  return res.json();
}

export async function fetchProducts(storeUrl: string, consumerKey: string, consumerSecret: string, page = 1, perPage = 50) {
  return wcFetch(storeUrl, consumerKey, consumerSecret, `products?page=${page}&per_page=${perPage}`);
}

export async function fetchOrders(storeUrl: string, consumerKey: string, consumerSecret: string, page = 1, perPage = 50) {
  return wcFetch(storeUrl, consumerKey, consumerSecret, `orders?page=${page}&per_page=${perPage}&orderby=date&order=desc`);
}

export async function fetchCustomers(storeUrl: string, consumerKey: string, consumerSecret: string, page = 1, perPage = 50) {
  return wcFetch(storeUrl, consumerKey, consumerSecret, `customers?page=${page}&per_page=${perPage}`);
}

export async function registerWebhooks(storeUrl: string, consumerKey: string, consumerSecret: string, deliveryUrl: string) {
  const topics = ['order.created', 'order.updated', 'customer.created'];
  const results = [];
  for (const topic of topics) {
    const url = new URL(`${storeUrl}/wp-json/wc/v3/webhooks`);
    url.searchParams.set('consumer_key', consumerKey);
    url.searchParams.set('consumer_secret', consumerSecret);
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `ForgeMsg ${topic}`, topic, delivery_url: deliveryUrl, status: 'active' }),
    });
    if (res.ok) results.push(await res.json());
  }
  return results;
}

export { testConnection };
