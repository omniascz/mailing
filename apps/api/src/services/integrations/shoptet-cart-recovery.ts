/**
 * Shoptet advanced integration — cart recovery, post-purchase triggers,
 * live product data in email, review requests.
 * Extends the basic Shoptet OAuth at /routes/v1/ecommerce-integrations.ts
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { socialAccounts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const SHOPTET_API_BASE = 'https://api.myshoptet.com';

export async function getShoptetToken(orgId: string): Promise<string> {
  const [row] = await db
    .select({ accessToken: socialAccounts.accessToken })
    .from(socialAccounts)
    .where(and(
      eq(socialAccounts.orgId, orgId),
      eq(socialAccounts.platform, 'shoptet'),
      eq(socialAccounts.active, true),
    ))
    .limit(1);
  if (!row?.accessToken) throw AppError.badRequest('Shoptet not connected');
  return row.accessToken;
}

async function shoptetFetch(orgId: string, path: string, opts: RequestInit = {}) {
  const token = await getShoptetToken(orgId);
  const resp = await fetch(`${SHOPTET_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw AppError.badRequest(`Shoptet API error ${resp.status}: ${err}`);
  }
  return resp.json() as Promise<Record<string, unknown>>;
}

/** Get abandoned carts from Shoptet (carts older than 1h, not converted). */
export async function getAbandonedCarts(orgId: string, limit = 50): Promise<Array<{
  cartId: string;
  contactEmail: string;
  contactName: string;
  totalValue: number;
  currency: string;
  items: Array<{ productId: string; productName: string; quantity: number; price: number; imageUrl?: string }>;
  abandonedAt: string;
}>> {
  const data = await shoptetFetch(orgId, `/api/v1/carts?status=abandoned&limit=${limit}`) as {
    data?: { carts?: Array<Record<string, unknown>> };
  };
  const carts = data?.data?.carts ?? [];

  return carts.map((cart) => {
    const customer = (cart['customer'] ?? {}) as Record<string, unknown>;
    const items = ((cart['items'] ?? []) as Array<Record<string, unknown>>).map((item) => ({
      productId: String(item['productId'] ?? ''),
      productName: String(item['name'] ?? ''),
      quantity: Number(item['quantity'] ?? 1),
      price: Number(item['price'] ?? 0),
      imageUrl: item['imageUrl'] as string | undefined,
    }));
    return {
      cartId: String(cart['cartGuid'] ?? ''),
      contactEmail: String(customer['email'] ?? ''),
      contactName: `${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}`.trim(),
      totalValue: Number(cart['totalPrice'] ?? 0),
      currency: String(cart['currency'] ?? 'CZK'),
      items,
      abandonedAt: String(cart['updatedAt'] ?? ''),
    };
  });
}

/** Get recent orders for post-purchase automation. */
export async function getRecentOrders(orgId: string, sinceHours = 24): Promise<Array<{
  orderId: string;
  contactEmail: string;
  contactName: string;
  status: string;
  totalValue: number;
  currency: string;
  items: Array<{ productId: string; productName: string; quantity: number }>;
  createdAt: string;
}>> {
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const data = await shoptetFetch(orgId, `/api/v1/orders?createdAfter=${encodeURIComponent(since)}&limit=100`) as {
    data?: { orders?: Array<Record<string, unknown>> };
  };
  const orders = data?.data?.orders ?? [];

  return orders.map((order) => {
    const customer = (order['customer'] ?? {}) as Record<string, unknown>;
    const items = ((order['items'] ?? []) as Array<Record<string, unknown>>).map((item) => ({
      productId: String(item['productId'] ?? ''),
      productName: String(item['name'] ?? ''),
      quantity: Number(item['quantity'] ?? 1),
    }));
    return {
      orderId: String(order['orderNumber'] ?? ''),
      contactEmail: String(customer['email'] ?? ''),
      contactName: `${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}`.trim(),
      status: String(order['status'] ?? ''),
      totalValue: Number(order['totalPrice'] ?? 0),
      currency: String(order['currency'] ?? 'CZK'),
      items,
      createdAt: String(order['createdAt'] ?? ''),
    };
  });
}

/** Fetch live product data for dynamic email content. */
export async function getProductData(orgId: string, productId: string): Promise<{
  name: string;
  price: number;
  originalPrice?: number;
  currency: string;
  stockLevel: number;
  inStock: boolean;
  imageUrl?: string;
  url?: string;
}> {
  const data = await shoptetFetch(orgId, `/api/v1/products/${productId}`) as {
    data?: { product?: Record<string, unknown> };
  };
  const p = data?.data?.product ?? {};
  const price = Number(p['price'] ?? 0);
  const originalPrice = p['standardPrice'] ? Number(p['standardPrice']) : undefined;
  const stockLevel = Number(p['stockQuantity'] ?? 0);

  return {
    name: String(p['name'] ?? ''),
    price,
    originalPrice: originalPrice !== price ? originalPrice : undefined,
    currency: String(p['currency'] ?? 'CZK'),
    stockLevel,
    inStock: stockLevel > 0,
    imageUrl: p['imageUrl'] as string | undefined,
    url: p['url'] as string | undefined,
  };
}

/** Send a review request to a customer for their completed order. */
export async function triggerReviewRequest(orgId: string, orderId: string): Promise<{ queued: boolean }> {
  await shoptetFetch(orgId, `/api/v1/orders/${orderId}/review-request`, { method: 'POST' });
  return { queued: true };
}
