/**
 * Revenue forecasting based on weighted pipeline value. The math lives in
 * `./pure.ts` so it can be unit-tested without the DB; this module handles
 * the data-fetch and delegates.
 */

import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deals } from '../../db/schema/index.js';
import { getPipeline } from './pipelines.js';
import {
  computeMonthlyForecast,
  type MonthlyForecast,
  type ForecastTotals,
  type OpenDealRow,
} from './pure.js';

export type { MonthlyForecast } from './pure.js';

export interface ForecastSummary {
  pipelineId: string;
  currency: string;
  horizonMonths: number;
  monthly: MonthlyForecast[];
  totals: ForecastTotals;
}

export async function forecastPipeline(
  orgId: string,
  pipelineId: string,
  opts: { horizonMonths?: number } = {},
): Promise<ForecastSummary> {
  const horizonMonths = opts.horizonMonths ?? 6;
  const pipeline = await getPipeline(orgId, pipelineId);

  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + horizonMonths + 1, 0));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const rows = await db
    .select({
      stageId: deals.stageId,
      value: deals.value,
      currency: deals.currency,
      expectedCloseDate: deals.expectedCloseDate,
    })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        eq(deals.status, 'open'),
        isNull(deals.deletedAt),
        gte(deals.expectedCloseDate, start),
        lte(deals.expectedCloseDate, end),
      ),
    );

  const normalized: OpenDealRow[] = rows.map((r) => ({
    stageId: r.stageId,
    value: Number(r.value),
    expectedCloseDate: r.expectedCloseDate,
    currency: r.currency,
  }));
  const currency = normalized[0]?.currency ?? 'USD';

  const { monthly, totals } = computeMonthlyForecast(
    normalized,
    pipeline.stages,
    horizonMonths,
    now,
  );

  return {
    pipelineId,
    currency,
    horizonMonths,
    monthly,
    totals,
  };
}
