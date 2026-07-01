import { describe, it, expect } from 'vitest';
import {
  buildShopifyPriceRule,
  buildShopifyDiscountCodesBatch,
  buildWooCoupon,
  chunkCodes,
  SHOPIFY_CODE_BATCH_LIMIT,
  type DiscountSpec,
} from './store-pure.js';

const percent: DiscountSpec = { discountType: 'percent', discountValue: 15, title: 'Spring 15%' };
const fixed: DiscountSpec = {
  discountType: 'fixed',
  discountValue: 10,
  title: 'Tenner off',
  expiresAt: '2026-12-31T23:59:59.000Z',
};

describe('Shopify price rule builder', () => {
  it('maps percent to a negative percentage value', () => {
    const req = buildShopifyPriceRule(percent);
    expect(req.method).toBe('POST');
    expect(req.path).toContain('/price_rules.json');
    const body = req.body as { price_rule: Record<string, unknown> };
    expect(body.price_rule.value_type).toBe('percentage');
    expect(body.price_rule.value).toBe('-15');
    expect(body.price_rule.usage_limit).toBe(1);
    expect(body.price_rule.ends_at).toBeUndefined();
  });

  it('maps fixed to fixed_amount with 2dp value and passes expiry', () => {
    const req = buildShopifyPriceRule(fixed);
    const body = req.body as { price_rule: Record<string, unknown> };
    expect(body.price_rule.value_type).toBe('fixed_amount');
    expect(body.price_rule.value).toBe('-10.00');
    expect(body.price_rule.ends_at).toBe('2026-12-31T23:59:59.000Z');
  });
});

describe('Shopify discount-codes batch builder', () => {
  it('wraps codes as { code } objects on the price-rule batch path', () => {
    const req = buildShopifyDiscountCodesBatch('pr_1', ['AAA', 'BBB']);
    expect(req.path).toBe('/admin/api/2024-01/price_rules/pr_1/batch.json');
    expect(req.body).toEqual({ discount_codes: [{ code: 'AAA' }, { code: 'BBB' }] });
  });

  it('rejects more than the 100-code limit', () => {
    const tooMany = Array.from({ length: SHOPIFY_CODE_BATCH_LIMIT + 1 }, (_, i) => `C${i}`);
    expect(() => buildShopifyDiscountCodesBatch('pr_1', tooMany)).toThrow();
  });
});

describe('chunkCodes', () => {
  it('splits into ≤100-code chunks by default', () => {
    const codes = Array.from({ length: 250 }, (_, i) => `C${i}`);
    const chunks = chunkCodes(codes);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
    expect(chunks.flat()).toHaveLength(250);
  });
});

describe('WooCommerce coupon builder', () => {
  it('maps percent → percent discount_type', () => {
    const req = buildWooCoupon('SAVE15', percent);
    expect(req.path).toBe('/wp-json/wc/v3/coupons');
    const body = req.body as Record<string, unknown>;
    expect(body.code).toBe('SAVE15');
    expect(body.discount_type).toBe('percent');
    expect(body.amount).toBe('15');
    expect(body.usage_limit).toBe(1);
  });

  it('maps fixed → fixed_cart and emits YYYY-MM-DD expiry', () => {
    const req = buildWooCoupon('TENNER', fixed);
    const body = req.body as Record<string, unknown>;
    expect(body.discount_type).toBe('fixed_cart');
    expect(body.amount).toBe('10');
    expect(body.date_expires).toBe('2026-12-31');
  });
});
