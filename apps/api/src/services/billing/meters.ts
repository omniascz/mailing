/**
 * Multi-product billing meters service (#283).
 *
 * recordUsage()      — increment a product's monthly counter (atomic upsert)
 * getProductUsage()  — read usage for a product in a billing period
 * getOrgUsageSummary — all products for an org in a period
 * computePeriodCost  — calculate billable cost at period end
 *
 * Email is not metered here (Z137). Its usage is the plan send counter
 * (plan_send_counters): one unit per non-sandboxed recipient with a `send`
 * row, kept by a trigger in the transaction that writes the row, on every send
 * path, keyed by the Stripe period — the number the plan limit is checked
 * against. The email meter row it replaces was written by one path out of
 * five, after the fact, with its failures swallowed, keyed by the server's
 * local calendar month; so the plan and the invoice counted different things.
 * Reading the counter makes them one number.
 */

import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  productUsageMeters,
  productMeterEvents,
  type MeterProduct,
} from '../../db/schema/product-meters.js';
import { planSendCounters } from '../../db/schema/plan-send-counters.js';

// ─── Per-product overage rates (USD per unit) ─────────────────────────────────

const DEFAULT_OVERAGE_RATES: Record<string, number> = {
  email: 0.0002, // $0.20 / 1000
  sms: 0.0075, // $7.50 / 1000
  whatsapp: 0.01, // $10   / 1000
  voice: 0.02, // $0.02 / minute
  push: 0.0001, // $0.10 / 1000
  in_app: 0.0001,
  viber: 0.005,
  rcs: 0.003,
  ai_tokens: 0.000001, // $1 / 1M tokens (Haiku)
  loyalty: 0.0002,
};

// ─── Current billing period ───────────────────────────────────────────────────

/** The calendar month of `date` in UTC, 'YYYY-MM' (it used to be server-local). */
export function currentPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/**
 * The organisation's current billing period: its start (plan_period_start —
 * the Stripe period, else the calendar month in UTC; the period email usage is
 * read for) and the UTC calendar month it starts in, which is the month the
 * other products' meters are read for when no period is asked for. One period
 * per answer, and the answer says which (Z138).
 */
export async function currentBillingPeriod(orgId: string): Promise<{ start: Date; month: string }> {
  const rows = (await db.execute(
    sql`SELECT plan_period_start(${orgId}::uuid) AS start`,
  )) as unknown as Array<{ start: Date | string }>;
  const start = new Date(rows[0]!.start);
  return { start, month: currentPeriod(start) };
}

// ─── Email: the plan send counter ─────────────────────────────────────────────

/**
 * Email units for a period, from the plan send counter. With no period: the
 * organisation's current billing period (plan_period_start — the Stripe period,
 * else the calendar month in UTC), the one the plan limit is checked against.
 * With a 'YYYY-MM': the billing periods that start in that calendar month
 * (UTC). For an organisation without a Stripe period that is exactly the month.
 */
async function emailUnits(orgId: string, period?: string): Promise<number> {
  const where = period
    ? and(
        eq(planSendCounters.orgId, orgId),
        sql`${planSendCounters.periodStart} >= (${`${period}-01`}::date AT TIME ZONE 'UTC')`,
        sql`${planSendCounters.periodStart} < ((${`${period}-01`}::date + interval '1 month') AT TIME ZONE 'UTC')`,
      )
    : and(
        eq(planSendCounters.orgId, orgId),
        eq(planSendCounters.periodStart, sql`plan_period_start(${orgId}::uuid)`),
      );
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${planSendCounters.sends}), 0)::int` })
    .from(planSendCounters)
    .where(where);
  return Number(row?.n ?? 0);
}

function emailUsage(units: number) {
  const rate = DEFAULT_OVERAGE_RATES.email ?? 0;
  return {
    unitsUsed: units,
    includedUnits: 0,
    overageUnits: units,
    estimatedCostUsd: Number((units * rate).toFixed(4)),
  };
}

// ─── Record usage ─────────────────────────────────────────────────────────────

/**
 * Both writes in one transaction, and a failure is the caller's error: a
 * billing write that may fail silently is not something to invoice from (Z137).
 * Not for email — see the header.
 */
export async function recordUsage(
  orgId: string,
  product: MeterProduct,
  units = 1,
  referenceId?: string,
  referenceType?: string,
): Promise<void> {
  if (product === 'email') {
    throw new Error('Email usage is the plan send counter, written with each send row (Z137)');
  }
  const period = currentPeriod();
  const rate = DEFAULT_OVERAGE_RATES[product] ?? 0;

  await db.transaction(async (tx) => {
    await tx
      .insert(productUsageMeters)
      .values({
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
    await tx.insert(productMeterEvents).values({
      orgId,
      product,
      units,
      referenceId,
      referenceType,
    });
  });
}

// ─── Read usage ───────────────────────────────────────────────────────────────

export async function getProductUsage(
  orgId: string,
  product: MeterProduct,
  periodArg?: string,
): Promise<{
  unitsUsed: number;
  includedUnits: number;
  overageUnits: number;
  estimatedCostUsd: number;
}> {
  if (product === 'email') return emailUsage(await emailUnits(orgId, periodArg));
  const period = periodArg ?? (await currentBillingPeriod(orgId)).month;
  const [row] = await db
    .select()
    .from(productUsageMeters)
    .where(
      and(
        eq(productUsageMeters.orgId, orgId),
        eq(productUsageMeters.product, product),
        eq(productUsageMeters.period, period),
      ),
    )
    .limit(1);

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

export async function getOrgUsageSummary(orgId: string, periodArg?: string) {
  const period = periodArg ?? (await currentBillingPeriod(orgId)).month;
  const rows = await db
    .select()
    .from(productUsageMeters)
    .where(
      and(
        eq(productUsageMeters.orgId, orgId),
        eq(productUsageMeters.period, period),
        // Email rows written before Z137 are not read: email is the counter.
        ne(productUsageMeters.product, 'email'),
      ),
    );

  const units = await emailUnits(orgId, periodArg);
  const email = units > 0 ? [{ product: 'email', ...emailUsage(units) }] : [];
  return [
    ...email,
    ...rows.map((r) => {
      const overage = Math.max(0, r.unitsUsed - r.includedUnits);
      const rate = Number(r.overageRateUsd);
      return {
        product: r.product,
        unitsUsed: r.unitsUsed,
        includedUnits: r.includedUnits,
        overageUnits: overage,
        estimatedCostUsd: Number((overage * rate).toFixed(4)),
      };
    }),
  ];
}

// ─── Period cost calculation ──────────────────────────────────────────────────

export async function computePeriodCost(orgId: string, period?: string): Promise<number> {
  const summary = await getOrgUsageSummary(orgId, period);
  return Number(summary.reduce((sum, s) => sum + s.estimatedCostUsd, 0).toFixed(4));
}
