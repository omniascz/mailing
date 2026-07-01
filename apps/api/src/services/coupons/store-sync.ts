/**
 * Store coupon sync — register a coupon batch's codes as real discount codes in
 * the connected store (Shopify / WooCommerce) so recipients can actually redeem
 * them at checkout. Without this, {{coupon_code}} codes are internal-only and
 * would be rejected at the store.
 *
 * Payload shapes live in store-pure.ts (unit-tested); this module owns the
 * network + persistence side.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { couponBatches, couponCodes } from '../../db/schema/index.js';
import type {
  ShopifyCredentials,
  WooCommerceCredentials,
} from '../../db/schema/ecommerce-integrations.js';
import { getConnection } from '../ecommerce/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  buildShopifyPriceRule,
  buildShopifyDiscountCodesBatch,
  buildWooCoupon,
  chunkCodes,
  type DiscountSpec,
  type StoreRequest,
} from './store-pure.js';

export interface StoreSyncResult {
  platform: 'shopify' | 'woocommerce';
  codesPushed: number;
  storeDiscountId: string | null;
}

/** Guard: WooCommerce needs one HTTP call per code, so cap batch size. */
const WOO_MAX_CODES = 1000;

export async function syncBatchToStore(
  orgId: string,
  batchId: string,
  connectionId: string,
): Promise<StoreSyncResult> {
  const [batch] = await db
    .select()
    .from(couponBatches)
    .where(and(eq(couponBatches.id, batchId), eq(couponBatches.orgId, orgId)))
    .limit(1);
  if (!batch) throw AppError.notFound('CouponBatch');

  const conn = await getConnection(orgId, connectionId);
  if (conn.platform !== 'shopify' && conn.platform !== 'woocommerce') {
    throw AppError.badRequest(
      `Store coupon sync supports shopify + woocommerce, not ${conn.platform}`,
    );
  }

  const codeRows = await db
    .select({ code: couponCodes.code })
    .from(couponCodes)
    .where(and(eq(couponCodes.batchId, batchId), eq(couponCodes.orgId, orgId)));
  const codes = codeRows.map((r) => r.code);
  if (codes.length === 0) throw AppError.badRequest('Batch has no codes to sync');

  const spec: DiscountSpec = {
    discountType: batch.discountType === 'fixed' ? 'fixed' : 'percent',
    discountValue: Number(batch.discountValue),
    title: batch.name,
    expiresAt: batch.expiresAt ? batch.expiresAt.toISOString() : null,
  };

  let storeDiscountId: string | null = null;

  if (conn.platform === 'shopify') {
    const creds = conn.credentials as ShopifyCredentials;
    // 1. Create the parent price rule.
    const ruleRes = await shopifyRequest(
      creds.shopDomain,
      creds.accessToken,
      buildShopifyPriceRule(spec),
    );
    const priceRuleId = String(
      (ruleRes as { price_rule?: { id?: number | string } })?.price_rule?.id ?? '',
    );
    if (!priceRuleId) throw AppError.internal('Shopify did not return a price rule id');
    storeDiscountId = priceRuleId;
    // 2. Attach codes in ≤100-code batches.
    for (const chunk of chunkCodes(codes)) {
      await shopifyRequest(
        creds.shopDomain,
        creds.accessToken,
        buildShopifyDiscountCodesBatch(priceRuleId, chunk),
      );
    }
  } else {
    const creds = conn.credentials as WooCommerceCredentials;
    if (codes.length > WOO_MAX_CODES) {
      throw AppError.badRequest(
        `WooCommerce sync is capped at ${WOO_MAX_CODES} codes per batch (got ${codes.length})`,
      );
    }
    // WooCommerce has no bulk-coupon endpoint — one coupon object per code.
    for (const code of codes) {
      await wooRequest(creds, buildWooCoupon(code, spec));
    }
  }

  await db
    .update(couponBatches)
    .set({
      storePlatform: conn.platform,
      storeConnectionId: connectionId,
      storeDiscountId,
      storeSyncedAt: new Date(),
    })
    .where(eq(couponBatches.id, batchId));

  return { platform: conn.platform, codesPushed: codes.length, storeDiscountId };
}

async function shopifyRequest(
  shopDomain: string,
  accessToken: string,
  req: StoreRequest,
): Promise<unknown> {
  const res = await fetch(`https://${shopDomain}${req.path}`, {
    method: req.method,
    headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
    body: req.method === 'GET' ? undefined : JSON.stringify(req.body),
  });
  if (!res.ok) {
    throw AppError.badRequest(
      `Shopify ${req.path} ${res.status}: ${await res.text().catch(() => '')}`,
    );
  }
  return res.json().catch(() => ({}));
}

async function wooRequest(creds: WooCommerceCredentials, req: StoreRequest): Promise<unknown> {
  const auth = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64');
  const res = await fetch(`${creds.storeUrl.replace(/\/$/, '')}${req.path}`, {
    method: req.method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: req.method === 'GET' ? undefined : JSON.stringify(req.body),
  });
  if (!res.ok) {
    throw AppError.badRequest(
      `WooCommerce ${req.path} ${res.status}: ${await res.text().catch(() => '')}`,
    );
  }
  return res.json().catch(() => ({}));
}
