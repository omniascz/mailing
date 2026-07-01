/**
 * Pure request builders for pushing coupon batches to store platforms.
 *
 * Separated from the network orchestrator (store-sync.ts) so the payload/path
 * mapping — the part that must be exactly right per each platform's REST API —
 * is unit-testable without any live store.
 *
 * Supported today: Shopify (one price rule + bulk discount codes) and
 * WooCommerce (one coupon object per code).
 */

export type StoreDiscountPlatform = 'shopify' | 'woocommerce';

export interface DiscountSpec {
  /** 'percent' → % off; 'fixed' → fixed currency amount off. */
  discountType: 'percent' | 'fixed';
  discountValue: number;
  /** Human-readable title (Shopify price rule title). */
  title: string;
  /** ISO timestamp when the discount expires (optional). */
  expiresAt?: string | null;
}

export interface StoreRequest {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body: unknown;
}

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Shopify: create the batch's parent price rule. Codes are attached to this
 * rule afterwards (see buildShopifyDiscountCodesBatch). Shopify expresses the
 * discount as a NEGATIVE value string; percentage uses 'percentage', fixed
 * uses 'fixed_amount'. usage_limit=1 makes each attached code single-use.
 */
export function buildShopifyPriceRule(spec: DiscountSpec): StoreRequest {
  const value =
    spec.discountType === 'percent'
      ? `-${Math.abs(spec.discountValue)}`
      : `-${Math.abs(spec.discountValue).toFixed(2)}`;
  return {
    method: 'POST',
    path: `/admin/api/${SHOPIFY_API_VERSION}/price_rules.json`,
    body: {
      price_rule: {
        title: spec.title,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: spec.discountType === 'percent' ? 'percentage' : 'fixed_amount',
        value,
        customer_selection: 'all',
        once_per_customer: true,
        usage_limit: 1,
        ...(spec.expiresAt ? { ends_at: spec.expiresAt } : {}),
      },
    },
  };
}

/** Shopify caps discount-code batch creation at 100 codes per request. */
export const SHOPIFY_CODE_BATCH_LIMIT = 100;

/** Split codes into ≤100-code chunks for the Shopify batch endpoint. */
export function chunkCodes(codes: string[], size = SHOPIFY_CODE_BATCH_LIMIT): string[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: string[][] = [];
  for (let i = 0; i < codes.length; i += size) out.push(codes.slice(i, i + size));
  return out;
}

/** Shopify: attach a chunk of discount codes to an existing price rule. */
export function buildShopifyDiscountCodesBatch(priceRuleId: string, codes: string[]): StoreRequest {
  if (codes.length > SHOPIFY_CODE_BATCH_LIMIT) {
    throw new Error(`Shopify accepts at most ${SHOPIFY_CODE_BATCH_LIMIT} codes per batch`);
  }
  return {
    method: 'POST',
    path: `/admin/api/${SHOPIFY_API_VERSION}/price_rules/${priceRuleId}/batch.json`,
    body: { discount_codes: codes.map((code) => ({ code })) },
  };
}

/**
 * WooCommerce: one coupon per code. 'percent' maps to WC 'percent';
 * 'fixed' maps to 'fixed_cart'. date_expires is a plain YYYY-MM-DD.
 */
export function buildWooCoupon(code: string, spec: DiscountSpec): StoreRequest {
  return {
    method: 'POST',
    path: `/wp-json/wc/v3/coupons`,
    body: {
      code,
      discount_type: spec.discountType === 'percent' ? 'percent' : 'fixed_cart',
      amount: String(Math.abs(spec.discountValue)),
      individual_use: true,
      usage_limit: 1,
      ...(spec.expiresAt ? { date_expires: spec.expiresAt.slice(0, 10) } : {}),
    },
  };
}
