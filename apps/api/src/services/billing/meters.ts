/**
 * Multi-product billing meters service (#283).
 *
 * recordUsage()      — increment a product's monthly counter (atomic upsert)
 * getProductUsage()  — read usage for a product in a billing period
 * getOrgUsageSummary — all products for an org in a period
 * computePeriodCost  — calculate billable cost at period end
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { productUsageMeters, productMeterEvents, type MeterProduct } from '../../db/schema/product-meters.js';

// ─── Per-product overage rates (USD per unit) ─────────────────────────────────

const DEFAULT_OVERAGE_RATES: Record<string, number> = {
  email:     0.0002,   // $0.20 / 1000
  sms:       0.0075,   // $7.50 / 1000
  whatsapp:  0.0100,   // $10   / 1000
  voice:     0.020,    // $0.02 / minute
  push:      0.0001,   // $0.10 / 1000
  in_app:    0.0001,
  viber:     0.0050,
  rcs:       0.0030,
  ai_tokens: 0.000001, // $1 / 1M tokens (Haiku)
  loyalty:   0.0002,
};

// ─── Current billing period ───────────────────────────────────────────────────

export function currentPeriod(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ─── Record usage ─────────────────────────────────────────────────────────────

export async function recordUsage(
  orgId: string,
  product: MeterProduct,
  units = 1,
  referenceId?: string,
  referenceType?: string,
): Promise<void> {
  const period = currentPeriod();
  const rate = DEFAULT_OVERAGE_RATES[product] ?? 0;

  // Atomic upsert on (orgId, product, period)
  await db.insert(productUsageMeters).values({
    orgId,
    product,
    period,
    unitsUsed: units,
    overageRateUsd: String(rate),
  })
    .onConflictDoUpdate({
      target: [productUsageMeters.orgId, productUsageMeters.product, productUsageMeters.period],
      set: {
        unitsUsed: sql`product_usage_meters.units_used + ${units}`,
        updatedAt: new Date(),
      },
    });

  // Append audit event (fire-and-forget)
  await db.insert(productMeterEvents).values({
    orgId,
    product,
    units,
    referenceId,
    referenceType,
  }).catch(() => {});
}

// ─── Read usage ───────────────────────────────────────────────────────────────

export async function getProductUsage(
  orgId: string,
  product: MeterProduct,
  period = currentPeriod(),
): Promise<{ unitsUsed: number; includedUnits: number; overageUnits: number; estimatedCostUsd: number }> {
  const [row] = await db.select().from(productUsageMeters)
    .where(and(
      eq(productUsageMeters.orgId, orgId),
      eq(productUsageMeters.product, product),
      eq(productUsageMeters.period, period),
    )).limit(1);

  const used = row?.unitsUsed ?? 0;
  const included = row?.includedUnits ?? 0;
  const rate = Number(row?.overageRateUsd ?? DEFAULT_OVERAGE_RATES[product] ?? 0);
  const overage = Math.max(0, used - included);

  return {
    unitsUsed: used,
    includedUnits: included,
    overageUnits: overage,
    estimatedCostUsd: Number((overage * rate).toFixed(4)),
  };
}

// ─── Full org summary ─────────────────────────────────────────────────────────

export async function getOrgUsageSummary(
  orgId: string,
  period = currentPeriod(),
) {
  const rows = await db.select().from(productUsageMeters)
    .where(and(
      eq(productUsageMeters.orgId, orgId),
      eq(productUsageMeters.period, period),
    ));

  return rows.map(r => {
    const overage = Math.max(0, r.unitsUsed - r.includedUnits);
    const rate = Number(r.overageRateUsd);
    return {
      product: r.product,
      unitsUsed: r.unitsUsed,
      includedUnits: r.includedUnits,
      overageUnits: overage,
      estimatedCostUsd: Number((overage * rate).toFixed(4)),
    };
  });
}

// ─── Period cost calculation ──────────────────────────────────────────────────

export async function computePeriodCost(orgId: string, period = currentPeriod()): Promise<number> {
  const summary = await getOrgUsageSummary(orgId, period);
  return Number(summary.reduce((sum, s) => sum + s.estimatedCostUsd, 0).toFixed(4));
}
