/**
 * Sales-CRM pure helpers (#395).
 *
 * Extracts the math/grouping logic out of the DB-coupled service modules so
 * we can unit-test it without needing the schema barrel. The services in
 * forecasting.ts / sales-reports.ts delegate to these functions after
 * fetching rows.
 */

export interface OpenDealRow {
  value: number;
  stageId: string;
  expectedCloseDate: Date | null;
  currency?: string;
}

export interface ClosedDealRow {
  value: number;
  status: 'won' | 'lost' | 'open';
  wonAt?: Date | null;
  lostAt?: Date | null;
  createdAt: Date;
  ownerUserId?: string | null;
  lostReason?: string | null;
  currency?: string;
}

export interface StageConfig {
  id: string;
  name: string;
  order: number;
  probability: number;
}

export interface MonthlyForecast {
  month: string; // YYYY-MM
  dealCount: number;
  bestCase: number;
  worstCase: number;
  weighted: number;
}

export interface ForecastTotals {
  dealCount: number;
  bestCase: number;
  worstCase: number;
  weighted: number;
}

// ─── Forecasting ────────────────────────────────────────────────────────────

/**
 * Bucket open deals into N months starting from `asOf` and compute
 * best-/worst-/weighted-case values. Pure — caller supplies the deal rows
 * and stage probabilities.
 *
 *   bestCase   = sum of all open-deal values in the month
 *   worstCase  = sum of values whose stage probability >= 75% (near-certain)
 *   weighted   = sum of value × probability/100
 */
export function computeMonthlyForecast(
  deals: OpenDealRow[],
  stages: StageConfig[],
  horizonMonths: number,
  asOf: Date = new Date(),
): { monthly: MonthlyForecast[]; totals: ForecastTotals } {
  if (horizonMonths <= 0) throw new Error('horizonMonths must be > 0');
  const stageProb = new Map(stages.map((s) => [s.id, s.probability]));

  const buckets = new Map<string, MonthlyForecast>();
  for (let i = 0; i < horizonMonths; i++) {
    const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + i, 1));
    const key = monthKey(d);
    buckets.set(key, { month: key, dealCount: 0, bestCase: 0, worstCase: 0, weighted: 0 });
  }

  for (const deal of deals) {
    if (!deal.expectedCloseDate) continue;
    const key = monthKey(deal.expectedCloseDate);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const probability = stageProb.get(deal.stageId) ?? 0;
    bucket.dealCount++;
    bucket.bestCase += deal.value;
    bucket.weighted += deal.value * (probability / 100);
    if (probability >= 75) bucket.worstCase += deal.value;
  }

  const monthly = [...buckets.values()].map((b) => ({
    ...b,
    bestCase: round2(b.bestCase),
    worstCase: round2(b.worstCase),
    weighted: round2(b.weighted),
  }));

  const totals = monthly.reduce<ForecastTotals>(
    (acc, m) => ({
      dealCount: acc.dealCount + m.dealCount,
      bestCase: round2(acc.bestCase + m.bestCase),
      worstCase: round2(acc.worstCase + m.worstCase),
      weighted: round2(acc.weighted + m.weighted),
    }),
    { dealCount: 0, bestCase: 0, worstCase: 0, weighted: 0 },
  );

  return { monthly, totals };
}

// ─── Win/loss ───────────────────────────────────────────────────────────────

export interface WinLossSummary {
  total: number;
  won: number;
  lost: number;
  open: number;
  winRate: number; // won / (won + lost); 0 when no closed deals
  totalWonValue: number;
  totalLostValue: number;
  averageWonValue: number;
  lostReasonBreakdown: Array<{ reason: string; count: number; share: number }>;
}

export function computeWinLoss(deals: ClosedDealRow[]): WinLossSummary {
  let won = 0;
  let lost = 0;
  let open = 0;
  let totalWonValue = 0;
  let totalLostValue = 0;
  const reasonCounts = new Map<string, number>();

  for (const d of deals) {
    if (d.status === 'won') {
      won++;
      totalWonValue += d.value;
    } else if (d.status === 'lost') {
      lost++;
      totalLostValue += d.value;
      const reason = d.lostReason?.trim() || 'unknown';
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    } else {
      open++;
    }
  }
  const closed = won + lost;
  const lostReasonBreakdown = [...reasonCounts.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      share: lost === 0 ? 0 : round4(count / lost),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: deals.length,
    won,
    lost,
    open,
    winRate: closed === 0 ? 0 : round4(won / closed),
    totalWonValue: round2(totalWonValue),
    totalLostValue: round2(totalLostValue),
    averageWonValue: won === 0 ? 0 : round2(totalWonValue / won),
    lostReasonBreakdown,
  };
}

// ─── Sales velocity ─────────────────────────────────────────────────────────

/**
 * Average days from createdAt → wonAt/lostAt. Only closed deals contribute.
 */
export function computeAverageCycleDays(deals: ClosedDealRow[]): {
  wonAverage: number;
  lostAverage: number;
} {
  let wonSum = 0;
  let wonCount = 0;
  let lostSum = 0;
  let lostCount = 0;

  for (const d of deals) {
    if (d.status === 'won' && d.wonAt) {
      wonSum += diffDays(d.createdAt, d.wonAt);
      wonCount++;
    } else if (d.status === 'lost' && d.lostAt) {
      lostSum += diffDays(d.createdAt, d.lostAt);
      lostCount++;
    }
  }

  return {
    wonAverage: wonCount === 0 ? 0 : round2(wonSum / wonCount),
    lostAverage: lostCount === 0 ? 0 : round2(lostSum / lostCount),
  };
}

// ─── Pipeline distribution ──────────────────────────────────────────────────

export interface StageDistribution {
  stageId: string;
  stageName: string;
  dealCount: number;
  totalValue: number;
  probability: number;
  order: number;
}

/**
 * Group open deals by their stage, returning one entry per configured stage
 * (including empty ones) in pipeline order.
 */
export function computeStageDistribution(
  deals: OpenDealRow[],
  stages: StageConfig[],
): StageDistribution[] {
  const byStage = new Map<string, { count: number; value: number }>();
  for (const d of deals) {
    const entry = byStage.get(d.stageId) ?? { count: 0, value: 0 };
    entry.count++;
    entry.value += d.value;
    byStage.set(d.stageId, entry);
  }
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const entry = byStage.get(s.id);
      return {
        stageId: s.id,
        stageName: s.name,
        order: s.order,
        probability: s.probability,
        dealCount: entry?.count ?? 0,
        totalValue: round2(entry?.value ?? 0),
      };
    });
}

// ─── Rep performance ────────────────────────────────────────────────────────

export interface RepPerformance {
  ownerUserId: string;
  deals: number;
  wonDeals: number;
  lostDeals: number;
  wonValue: number;
  winRate: number;
}

export function computeRepPerformance(deals: ClosedDealRow[]): RepPerformance[] {
  const byOwner = new Map<string, RepPerformance>();
  for (const d of deals) {
    if (!d.ownerUserId) continue;
    const rec =
      byOwner.get(d.ownerUserId) ??
      ({
        ownerUserId: d.ownerUserId,
        deals: 0,
        wonDeals: 0,
        lostDeals: 0,
        wonValue: 0,
        winRate: 0,
      } as RepPerformance);
    rec.deals++;
    if (d.status === 'won') {
      rec.wonDeals++;
      rec.wonValue += d.value;
    } else if (d.status === 'lost') {
      rec.lostDeals++;
    }
    byOwner.set(d.ownerUserId, rec);
  }

  for (const rec of byOwner.values()) {
    const closed = rec.wonDeals + rec.lostDeals;
    rec.winRate = closed === 0 ? 0 : round4(rec.wonDeals / closed);
    rec.wonValue = round2(rec.wonValue);
  }

  return [...byOwner.values()].sort((a, b) => b.wonValue - a.wonValue);
}

// ─── Internals ──────────────────────────────────────────────────────────────

function monthKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function diffDays(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
