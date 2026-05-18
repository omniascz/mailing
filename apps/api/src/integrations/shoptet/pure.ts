/**
 * Shoptet pure helpers (#366/#386).
 *
 * No DB / no service-layer deps — just normalization and signature logic so
 * we can exercise this module in unit tests independent of the Drizzle schema
 * barrel. The service layer re-exports these same functions from
 * `services/ecommerce` for convenience to existing callers.
 */

import crypto from 'node:crypto';

export interface ShoptetNormalizedOrderItem {
  sku?: string;
  name: string;
  qty: number;
  price: number;
  productId?: string;
}

export interface ShoptetNormalizedOrder {
  externalOrderId: string;
  customerEmail: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  items: ShoptetNormalizedOrderItem[];
  orderedAt: Date | null;
}

/**
 * Verify a Shoptet webhook signature. Shoptet signs the raw request body
 * with HMAC-SHA256 keyed by the per-connection webhook secret, then sends
 * the hex-encoded digest in the `X-Shoptet-Signature` header.
 */
export function verifyShoptetWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Flatten a Shoptet order payload. Shoptet uses camelCase keys and nests the
 * customer + items:
 *   { code, creationTime, status, totalPrice, currency,
 *     customer: { email, firstName, lastName, phone },
 *     items:    [{ name, amount, itemPriceWithVat, code?, productGuid? }] }
 */
export function normalizeShoptetOrderPayload(
  raw: Record<string, unknown>,
): ShoptetNormalizedOrder {
  const customer = (raw.customer as Record<string, unknown>) ?? {};
  const rawItems = (raw.items as Array<Record<string, unknown>>) ?? [];
  const items: ShoptetNormalizedOrderItem[] = rawItems.map((item) => {
    const skuVal = (item.code ?? item.sku) as unknown;
    const productVal = item.productGuid as unknown;
    return {
      ...(typeof skuVal === 'string' ? { sku: skuVal } : {}),
      name: String(item.name ?? ''),
      qty: Number(item.amount ?? item.quantity ?? 1),
      price: Number(item.itemPriceWithVat ?? item.price ?? 0),
      ...(productVal != null ? { productId: String(productVal) } : {}),
    };
  });

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

/**
 * Strip trailing slashes and lowercase the host portion so eshop URLs are
 * compared as canonical strings.
 */
export function normalizeEshopUrl(input: string): string {
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
