/**
 * Upgates pure helpers (#367/#390).
 *
 * No DB / no service-layer deps so tests can exercise normalization + signature
 * logic independently of the Drizzle schema barrel.
 */

import crypto from 'node:crypto';

export interface UpgatesNormalizedOrderItem {
  sku?: string;
  name: string;
  qty: number;
  price: number;
  productId?: string;
}

export interface UpgatesNormalizedOrder {
  externalOrderId: string;
  customerEmail: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  items: UpgatesNormalizedOrderItem[];
  orderedAt: Date | null;
}

/**
 * Verify an Upgates webhook signature. Upgates partners configure an HMAC
 * shared secret; the body is signed with HMAC-SHA256 and the hex digest is
 * sent in the `X-Upgates-Signature` header.
 */
export function verifyUpgatesWebhookSignature(
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

/**
 * Flatten an Upgates order payload. Shape (v2 API):
 *   { order_number, date, status, total_with_vat, currency,
 *     customer: { email, firstname_invoice, surname_invoice, phone },
 *     products: [{ code, title, quantity, unit_price_with_vat, ... }] }
 */
export function normalizeUpgatesOrderPayload(raw: Record<string, unknown>): UpgatesNormalizedOrder {
  const customer = (raw.customer as Record<string, unknown>) ?? {};
  const rawItems = ((raw.products ?? raw.items) as Array<Record<string, unknown>>) ?? [];
  const items: UpgatesNormalizedOrderItem[] = rawItems.map((item) => {
    const sku = (item.code ?? item.sku) as unknown;
    const productId = (item.product_id ?? item.productId) as unknown;
    return {
      ...(typeof sku === 'string' ? { sku } : {}),
      name: String(item.title ?? item.name ?? ''),
      qty: Number(item.quantity ?? item.amount ?? 1),
      price: Number(item.unit_price_with_vat ?? item.unitPriceWithVat ?? item.price ?? 0),
      ...(productId != null ? { productId: String(productId) } : {}),
    };
  });

  const orderDate = raw.date ?? raw.created_at ?? raw.createdAt;
  const totalRaw = raw.total_with_vat ?? raw.totalWithVat ?? raw.total ?? '0';
  return {
    externalOrderId: String(raw.order_number ?? raw.orderNumber ?? raw.id ?? ''),
    customerEmail: (customer.email as string) || null,
    status: String(raw.status ?? 'unknown'),
    totalAmount: String(totalRaw),
    currency: String(raw.currency ?? 'CZK'),
    items,
    orderedAt: orderDate ? new Date(String(orderDate)) : null,
  };
}

/**
 * Normalize an Upgates admin URL to `https://{slug}.admin.upgates.com` form
 * without trailing slash. Lowercases the host, adds https:// when missing.
 */
export function normalizeUpgatesAdminUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return withProtocol.replace(/\/+$/, '');
  }
}

/** Build the Basic-auth header value for Upgates API calls. */
export function buildUpgatesAuthHeader(apiLogin: string, apiKey: string): string {
  const token = Buffer.from(`${apiLogin}:${apiKey}`).toString('base64');
  return `Basic ${token}`;
}
