/**
 * E-commerce integration service — #79 (Shopify), #80 (WooCommerce), #81 (BigCommerce / Magento / PrestaShop)
 *
 * Responsibilities:
 *  - Connection CRUD (create, list, test, delete)
 *  - Shopify OAuth install / callback flow
 *  - Webhook signature verification per platform
 *  - Order ingestion → revenue attribution + contact upsert
 *  - Customer sync → contact upsert
 */

import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  ecommerceConnections,
  ecommerceOrders,
  ecommerceWebhookEvents,
  type EcommerceConnection,
  type ShopifyCredentials,
  type WooCommerceCredentials,
  type BigCommerceCredentials,
  type MagentoCredentials,
  type PrestaShopCredentials,
  type ShoptetCredentials,
  type EcommerceOrderItem,
} from '../../db/schema/index.js';
import { contacts, contactEngagement } from '../../db/schema/index.js';
import { trackPurchase } from '../revenue-attribution/index.js';
import { AppError } from '../../lib/app-error.js';
import { sql } from 'drizzle-orm';

// ─── Connection CRUD ──────────────────────────────────────────────────────────

export async function listConnections(orgId: string): Promise<EcommerceConnection[]> {
  return db
    .select()
    .from(ecommerceConnections)
    .where(eq(ecommerceConnections.orgId, orgId));
}

export async function getConnection(orgId: string, id: string): Promise<EcommerceConnection> {
  const [conn] = await db
    .select()
    .from(ecommerceConnections)
    .where(and(eq(ecommerceConnections.id, id), eq(ecommerceConnections.orgId, orgId)))
    .limit(1);
  if (!conn) throw AppError.notFound('Connection');
  return conn;
}

export async function createConnection(
  orgId: string,
  input: { platform: EcommerceConnection['platform']; name: string; credentials: EcommerceConnection['credentials'] },
): Promise<EcommerceConnection> {
  const [conn] = await db
    .insert(ecommerceConnections)
    .values({ orgId, ...input })
    .returning();
  return conn!;
}

export async function deleteConnection(orgId: string, id: string): Promise<void> {
  await db
    .delete(ecommerceConnections)
    .where(and(eq(ecommerceConnections.id, id), eq(ecommerceConnections.orgId, orgId)));
}

// ─── Shopify OAuth ────────────────────────────────────────────────────────────

const SHOPIFY_SCOPES = 'read_orders,read_customers,read_products';

/**
 * Step 1 — generate the Shopify install redirect URL.
 * The caller stores `state` in a short-lived Redis key, then redirects the user.
 */
export function buildShopifyInstallUrl(shopDomain: string, state: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY ?? '';
  const redirectUri = `${process.env.API_BASE_URL ?? ''}/api/v1/ecommerce/shopify/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    'grant_options[]': 'per-user',
  });
  return `https://${shopDomain}/admin/oauth/authorize?${params}`;
}

/**
 * Step 2 — exchange the OAuth code for a permanent access token.
 */
export async function exchangeShopifyCode(
  shopDomain: string,
  code: string,
): Promise<{ accessToken: string; scope: string }> {
  const apiKey = process.env.SHOPIFY_API_KEY ?? '';
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? '';

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });
  if (!res.ok) {
    throw new AppError({ code: 'SHOPIFY_OAUTH_ERROR', message: 'Shopify OAuth token exchange failed', statusCode: 502 });
  }
  const data = await res.json() as { access_token: string; scope: string };
  return { accessToken: data.access_token, scope: data.scope };
}

/**
 * Register Shopify webhooks after OAuth completes.
 */
export async function registerShopifyWebhooks(shopDomain: string, accessToken: string): Promise<void> {
  const webhookBase = `${process.env.API_BASE_URL ?? ''}/api/v1/ecommerce/webhooks/shopify`;
  const topics = ['orders/create', 'orders/updated', 'customers/create', 'app/uninstalled'];

  for (const topic of topics) {
    await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        webhook: { topic, address: `${webhookBase}/${topic.replace('/', '_')}`, format: 'json' },
      }),
    }).catch(() => {});
  }
}

// ─── Shoptet OAuth (#366/#386) ───────────────────────────────────────────────

/**
 * Shoptet authorization URL. The eshop owner grants MailForge access from
 * their Shoptet admin; the exact authorize path is partner-configured. The
 * caller stores `state` in short-lived Redis and redirects the browser.
 *
 * Env:
 *   SHOPTET_CLIENT_ID    — partner client id
 *   API_BASE_URL         — used to construct the callback URL
 *   SHOPTET_OAUTH_BASE   — optional override (defaults to `https://api.shoptet.com`)
 */
export function buildShoptetAuthorizeUrl(eshopUrl: string, state: string): string {
  const clientId = process.env.SHOPTET_CLIENT_ID ?? '';
  const apiBase = process.env.API_BASE_URL ?? '';
  const oauthBase = process.env.SHOPTET_OAUTH_BASE ?? 'https://api.shoptet.com';
  const redirectUri = `${apiBase}/api/v1/ecommerce/shoptet/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    eshop_url: eshopUrl,
  });
  return `${oauthBase}/oauth/authorize?${params}`;
}

/**
 * Exchange the authorization code for an access token.
 */
export async function exchangeShoptetCode(
  eshopUrl: string,
  code: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}> {
  const clientId = process.env.SHOPTET_CLIENT_ID ?? '';
  const clientSecret = process.env.SHOPTET_CLIENT_SECRET ?? '';
  const apiBase = process.env.API_BASE_URL ?? '';
  const oauthBase = process.env.SHOPTET_OAUTH_BASE ?? 'https://api.shoptet.com';
  const redirectUri = `${apiBase}/api/v1/ecommerce/shoptet/callback`;

  const res = await fetch(`${oauthBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      eshop_url: eshopUrl,
    }),
  });
  if (!res.ok) {
    throw new AppError({
      code: 'SHOPTET_OAUTH_ERROR',
      message: 'Shoptet OAuth token exchange failed',
      statusCode: 502,
    });
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

/**
 * Refresh an expired Shoptet access token.
 */
export async function refreshShoptetToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const clientId = process.env.SHOPTET_CLIENT_ID ?? '';
  const clientSecret = process.env.SHOPTET_CLIENT_SECRET ?? '';
  const oauthBase = process.env.SHOPTET_OAUTH_BASE ?? 'https://api.shoptet.com';

  const res = await fetch(`${oauthBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new AppError({
      code: 'SHOPTET_OAUTH_REFRESH_ERROR',
      message: 'Shoptet token refresh failed',
      statusCode: 502,
    });
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ─── Webhook signature verification ──────────────────────────────────────────

export function verifyShopifyWebhook(rawBody: string, hmacHeader: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export function verifyWooCommerceWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export function verifyBigCommerceWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  // BigCommerce uses SHA-256 HMAC of the raw body, hex-encoded
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Shoptet webhook signature verification (#366/#386).
 * Shoptet signs payloads with HMAC-SHA256 of the raw body using the shared
 * webhook secret, hex-encoded and sent in the `X-Shoptet-Signature` header.
 */
export function verifyShoptetWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

// ─── Order ingestion (platform-agnostic) ─────────────────────────────────────

interface NormalizedOrder {
  externalOrderId: string;
  customerEmail: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  items: EcommerceOrderItem[];
  orderedAt: Date | null;
}

export async function ingestOrder(
  connection: EcommerceConnection,
  order: NormalizedOrder,
): Promise<void> {
  // Log webhook event
  await db
    .insert(ecommerceWebhookEvents)
    .values({
      connectionId: connection.id,
      orgId: connection.orgId,
      topic: 'orders/create',
      externalId: order.externalOrderId,
    })
    .onConflictDoNothing();

  // Check for duplicate
  const [existing] = await db
    .select({ id: ecommerceOrders.id })
    .from(ecommerceOrders)
    .where(
      and(
        eq(ecommerceOrders.connectionId, connection.id),
        eq(ecommerceOrders.externalOrderId, order.externalOrderId),
      ),
    )
    .limit(1);

  if (existing) return; // already processed

  // Find or create contact
  let contactId: string | undefined;
  if (order.customerEmail) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, connection.orgId), eq(contacts.email, order.customerEmail.toLowerCase())))
      .limit(1);
    contactId = contact?.id;
  }

  // Record order
  await db.insert(ecommerceOrders).values({
    connectionId: connection.id,
    orgId: connection.orgId,
    externalOrderId: order.externalOrderId,
    contactId: contactId ?? null,
    customerEmail: order.customerEmail,
    status: order.status,
    totalAmount: order.totalAmount,
    currency: order.currency,
    items: order.items,
    orderedAt: order.orderedAt,
  });

  // Update revenue attribution if we have a contact
  if (contactId && order.customerEmail) {
    await trackPurchase({
      orgId: connection.orgId,
      orderId: order.externalOrderId,
      amount: parseFloat(order.totalAmount),
      currency: order.currency,
      items: order.items.map((item) => ({ ...item, sku: item.sku ?? '' })),
      occurredAt: order.orderedAt ?? undefined,
    }).catch(() => {});

    // Update engagement aggregate
    await db
      .insert(contactEngagement)
      .values({
        contactId,
        orgId: connection.orgId,
        totalOrders: 1,
        totalRevenue: order.totalAmount,
        lastOrderAt: order.orderedAt ?? new Date(),
        firstOrderAt: order.orderedAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: contactEngagement.contactId,
        set: {
          totalOrders: sql`contact_engagement.total_orders + 1`,
          totalRevenue: sql`contact_engagement.total_revenue + ${order.totalAmount}::numeric`,
          lastOrderAt: order.orderedAt ?? new Date(),
          updatedAt: new Date(),
        },
      });
  }

  // Mark webhook event as processed
  await db
    .update(ecommerceWebhookEvents)
    .set({ processed: true })
    .where(
      and(
        eq(ecommerceWebhookEvents.connectionId, connection.id),
        eq(ecommerceWebhookEvents.externalId, order.externalOrderId),
      ),
    );
}

// ─── Platform-specific order normalizers ──────────────────────────────────────

export function normalizeShopifyOrder(raw: Record<string, unknown>): NormalizedOrder {
  const lineItems = (raw.line_items as Array<Record<string, unknown>> ?? []).map((item) => ({
    sku: (item.sku as string) || undefined,
    name: item.name as string,
    qty: Number(item.quantity),
    price: parseFloat(item.price as string),
    productId: String(item.product_id ?? ''),
  }));

  return {
    externalOrderId: String(raw.id),
    customerEmail: (raw.email as string) || null,
    status: raw.financial_status as string ?? 'unknown',
    totalAmount: raw.total_price as string ?? '0',
    currency: raw.currency as string ?? 'USD',
    items: lineItems,
    orderedAt: raw.created_at ? new Date(raw.created_at as string) : null,
  };
}

export function normalizeWooCommerceOrder(raw: Record<string, unknown>): NormalizedOrder {
  const billing = raw.billing as Record<string, unknown> ?? {};
  const lineItems = (raw.line_items as Array<Record<string, unknown>> ?? []).map((item) => ({
    sku: (item.sku as string) || undefined,
    name: item.name as string,
    qty: Number(item.quantity),
    price: parseFloat(item.price as string),
    productId: String(item.product_id ?? ''),
  }));

  return {
    externalOrderId: String(raw.id),
    customerEmail: (billing.email as string) || null,
    status: raw.status as string ?? 'unknown',
    totalAmount: raw.total as string ?? '0',
    currency: raw.currency as string ?? 'USD',
    items: lineItems,
    orderedAt: raw.date_created ? new Date(raw.date_created as string) : null,
  };
}

export function normalizeBigCommerceOrder(raw: Record<string, unknown>): NormalizedOrder {
  const lineItems = (raw.products as Array<Record<string, unknown>> ?? []).map((item) => ({
    sku: (item.sku as string) || undefined,
    name: item.name as string,
    qty: Number(item.quantity),
    price: parseFloat(String(item.base_price ?? 0)),
    productId: String(item.product_id ?? ''),
  }));

  return {
    externalOrderId: String(raw.id),
    customerEmail: (raw.billing_address as Record<string, unknown>)?.email as string || null,
    status: raw.status as string ?? 'unknown',
    totalAmount: raw.total_inc_tax as string ?? '0',
    currency: raw.currency_code as string ?? 'USD',
    items: lineItems,
    orderedAt: raw.date_created ? new Date(raw.date_created as string) : null,
  };
}

export function normalizeMagentoOrder(raw: Record<string, unknown>): NormalizedOrder {
  const lineItems = (raw.items as Array<Record<string, unknown>> ?? []).map((item) => ({
    sku: item.sku as string,
    name: item.name as string,
    qty: Number(item.qty_ordered),
    price: Number(item.price),
    productId: String(item.product_id ?? ''),
  }));

  return {
    externalOrderId: raw.increment_id as string ?? String(raw.entity_id),
    customerEmail: raw.customer_email as string || null,
    status: raw.status as string ?? 'unknown',
    totalAmount: String(raw.grand_total ?? 0),
    currency: raw.order_currency_code as string ?? 'USD',
    items: lineItems,
    orderedAt: raw.created_at ? new Date(raw.created_at as string) : null,
  };
}

/**
 * Shoptet order normalizer (#366/#386). Shoptet payloads use camelCase keys
 * with nested `customer` + `items` shape:
 *   { code, creationTime, customer: { email, firstName, lastName, phone },
 *     totalPrice, currency, status, items: [{ name, amount, itemPriceWithVat }] }
 */
export function normalizeShoptetOrder(raw: Record<string, unknown>): NormalizedOrder {
  const customer = (raw.customer as Record<string, unknown>) ?? {};
  const rawItems = (raw.items as Array<Record<string, unknown>>) ?? [];
  const items = rawItems.map((item) => ({
    sku: (item.code ?? item.sku) as string | undefined,
    name: String(item.name ?? ''),
    qty: Number(item.amount ?? item.quantity ?? 1),
    price: Number(item.itemPriceWithVat ?? item.price ?? 0),
    productId: item.productGuid != null ? String(item.productGuid) : undefined,
  }));

  const creationTime = raw.creationTime ?? raw.createdAt;
  return {
    externalOrderId: String(raw.code ?? raw.id ?? ''),
    customerEmail: (customer.email as string) || null,
    status: String(raw.status ?? 'unknown'),
    totalAmount: String(raw.totalPrice ?? raw.total ?? '0'),
    currency: String(raw.currency ?? 'CZK'),
    items,
    orderedAt: creationTime ? new Date(String(creationTime)) : null,
  };
}

export function normalizePrestaShopOrder(raw: Record<string, unknown>): NormalizedOrder {
  const lineItems = (raw.associations as Record<string, unknown>)?.order_rows as Array<Record<string, unknown>> ?? [];
  const items = lineItems.map((item) => ({
    sku: item.product_reference as string,
    name: item.product_name as string,
    qty: Number(item.product_quantity),
    price: parseFloat(item.unit_price_tax_incl as string),
    productId: String(item.product_id ?? ''),
  }));

  return {
    externalOrderId: String(raw.id),
    customerEmail: raw.customer_email as string || null,
    status: String(raw.current_state ?? 'unknown'),
    totalAmount: raw.total_paid as string ?? '0',
    currency: raw.id_currency as string ?? 'EUR',
    items,
    orderedAt: raw.date_add ? new Date(raw.date_add as string) : null,
  };
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testConnection(connection: EcommerceConnection): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (connection.platform) {
      case 'shopify': {
        const creds = connection.credentials as ShopifyCredentials;
        const res = await fetch(
          `https://${creds.shopDomain}/admin/api/2024-01/shop.json`,
          { headers: { 'X-Shopify-Access-Token': creds.accessToken } },
        );
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'woocommerce': {
        const creds = connection.credentials as WooCommerceCredentials;
        const auth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64');
        const res = await fetch(`${creds.storeUrl}/wp-json/wc/v3/system_status`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'bigcommerce': {
        const creds = connection.credentials as BigCommerceCredentials;
        const res = await fetch(
          `https://api.bigcommerce.com/stores/${creds.storeHash}/v2/store`,
          {
            headers: {
              'X-Auth-Token': creds.accessToken,
              Accept: 'application/json',
            },
          },
        );
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'magento': {
        const creds = connection.credentials as MagentoCredentials;
        const res = await fetch(`${creds.baseUrl}/rest/V1/store/storeViews`, {
          headers: { Authorization: `Bearer ${creds.accessToken}` },
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'prestashop': {
        const creds = connection.credentials as PrestaShopCredentials;
        const auth = Buffer.from(`${creds.apiKey}:`).toString('base64');
        const res = await fetch(`${creds.baseUrl}/api/?output_format=JSON`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      case 'shoptet': {
        const creds = connection.credentials as ShoptetCredentials;
        // Shoptet exposes eshop info at {eshopUrl}/action/ApiShopInfo
        const res = await fetch(`${creds.eshopUrl}/action/ApiShopInfo`, {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/json',
          },
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      }

      default:
        return { ok: false, error: 'Unknown platform' };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
