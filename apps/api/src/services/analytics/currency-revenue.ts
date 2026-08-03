/**
 * Per-currency revenue analytics — CZK / EUR / USD / GBP breakdown.
 * Shows revenue, orders, and AOV per currency and per campaign.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { revenueEvents } from '../../db/schema/revenue.js';

export interface CurrencyBreakdown {
  currency: string;
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
  revenuePerEmail: number;
  topCampaignId: string | null;
}

export interface CurrencyRevenueReport {
  breakdown: CurrencyBreakdown[];
  totalRevenueUsd: number; // normalized to USD using fixed rates
  period: { from: string; to: string };
}

// Static exchange rates (updated periodically — in prod these come from ECB API)
const RATES_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  CZK: 0.044,
  GBP: 1.27,
  PLN: 0.25,
  SKK: 0, // legacy
};

function toUsd(amount: number, currency: string): number {
  return amount * (RATES_TO_USD[currency.toUpperCase()] ?? 1);
}

export async function getCurrencyRevenue(
  orgId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<CurrencyRevenueReport> {
  const rows = await db
    .select({
      currency: revenueEvents.currency,
      totalRevenue: sql<string>`coalesce(sum(amount::numeric), 0)`,
      orderCount: sql<number>`count(*)::int`,
      topCampaignId: sql<string | null>`mode() within group (order by campaign_id)`,
    })
    .from(revenueEvents)
    .where(
      and(
        eq(revenueEvents.orgId, orgId),
        gte(revenueEvents.occurredAt, dateFrom),
        sql`occurred_at <= ${dateTo.toISOString()}`,
      ),
    )
    .groupBy(revenueEvents.currency);

  // Per-currency email sent count for RPE calculation
  const sentRow = await db
    .select({ sent: sql<number>`count(*)::int` })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), gte(revenueEvents.occurredAt, dateFrom)));
  const totalEmailsSent = Math.max(1, Number(sentRow[0]?.sent ?? 1));

  const breakdown: CurrencyBreakdown[] = rows.map((r) => {
    const revenue = Number(r.totalRevenue);
    const orders = Number(r.orderCount);
    return {
      currency: r.currency ?? 'USD',
      totalRevenue: revenue,
      orderCount: orders,
      avgOrderValue: orders > 0 ? revenue / orders : 0,
      revenuePerEmail: revenue / totalEmailsSent,
      topCampaignId: r.topCampaignId ?? null,
    };
  });

  const totalRevenueUsd = breakdown.reduce((sum, b) => sum + toUsd(b.totalRevenue, b.currency), 0);

  return {
    breakdown,
    totalRevenueUsd,
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
  };
}

export async function getCurrencyRevenueByMonth(
  orgId: string,
  months = 6,
): Promise<Array<{ month: string; currency: string; revenue: number; orders: number }>> {
  const since = new Date(Date.now() - months * 30 * 86400_000);

  const rows = await db
    .select({
      month: sql<string>`to_char(occurred_at, 'YYYY-MM')`,
      currency: revenueEvents.currency,
      revenue: sql<string>`coalesce(sum(amount::numeric), 0)`,
      orders: sql<number>`count(*)::int`,
    })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), gte(revenueEvents.occurredAt, since)))
    .groupBy(sql`to_char(occurred_at, 'YYYY-MM')`, revenueEvents.currency)
    .orderBy(sql`to_char(occurred_at, 'YYYY-MM')`);

  return rows.map((r) => ({
    month: r.month,
    currency: r.currency ?? 'USD',
    revenue: Number(r.revenue),
    orders: Number(r.orders),
  }));
}
