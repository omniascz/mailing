/**
 * Sales CRM reports:
 *  - Deals by stage (pipeline distribution)
 *  - Conversion rates between stages
 *  - Sales velocity (avg time to close)
 *  - Rep performance (deals won + value per owner)
 *  - Win/loss analysis (win ratio, lost reasons)
 */

import { and, count, eq, gte, isNull, sql, sum } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deals, dealStageHistory } from '../../db/schema/index.js';
import { getPipeline } from './pipelines.js';

export interface StageDistribution {
  stageId: string;
  stageName: string;
  dealCount: number;
  totalValue: number;
  probability: number;
}

export async function dealsByStage(
  orgId: string,
  pipelineId: string,
): Promise<StageDistribution[]> {
  const pipeline = await getPipeline(orgId, pipelineId);

  const rows = await db
    .select({
      stageId: deals.stageId,
      dealCount: count(),
      totalValue: sum(deals.value),
    })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        eq(deals.status, 'open'),
        isNull(deals.deletedAt),
      ),
    )
    .groupBy(deals.stageId);

  const byStage = new Map(rows.map((r) => [r.stageId, r]));

  return pipeline.stages
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const row = byStage.get(stage.id);
      return {
        stageId: stage.id,
        stageName: stage.name,
        dealCount: row ? Number(row.dealCount) : 0,
        totalValue: row?.totalValue ? Number(row.totalValue) : 0,
        probability: stage.probability,
      };
    });
}

export interface ConversionRate {
  fromStageId: string;
  toStageId: string;
  transitions: number;
  uniqueDeals: number;
  conversionRate: number; // 0..1 — share of deals that entered fromStage and later reached toStage
}

export async function conversionRates(
  orgId: string,
  pipelineId: string,
  days = 90,
): Promise<ConversionRate[]> {
  const pipeline = await getPipeline(orgId, pipelineId);
  const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
  const since = new Date(Date.now() - days * 86400_000);

  const history = await db
    .select({
      dealId: dealStageHistory.dealId,
      fromStageId: dealStageHistory.fromStageId,
      toStageId: dealStageHistory.toStageId,
    })
    .from(dealStageHistory)
    .innerJoin(deals, eq(deals.id, dealStageHistory.dealId))
    .where(
      and(
        eq(dealStageHistory.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        gte(dealStageHistory.changedAt, since),
      ),
    );

  // For every consecutive stage pair, compute how many deals ever hit the "from"
  // stage and how many eventually made it to the "to" stage.
  const touched: Record<string, Set<string>> = {};
  for (const h of history) {
    if (h.fromStageId) (touched[h.fromStageId] ??= new Set()).add(h.dealId);
    (touched[h.toStageId] ??= new Set()).add(h.dealId);
  }

  const results: ConversionRate[] = [];
  for (let i = 0; i < sortedStages.length - 1; i++) {
    const from = sortedStages[i]!;
    const to = sortedStages[i + 1]!;
    const fromDeals = touched[from.id] ?? new Set();
    const toDeals = touched[to.id] ?? new Set();
    const converted = [...fromDeals].filter((id) => toDeals.has(id)).length;
    results.push({
      fromStageId: from.id,
      toStageId: to.id,
      transitions: converted,
      uniqueDeals: fromDeals.size,
      conversionRate: fromDeals.size > 0 ? converted / fromDeals.size : 0,
    });
  }

  return results;
}

export interface VelocityStats {
  avgDaysToWin: number;
  avgDaysToLose: number;
  sampleWon: number;
  sampleLost: number;
}

export async function salesVelocity(
  orgId: string,
  pipelineId: string,
  days = 180,
): Promise<VelocityStats> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      status: deals.status,
      createdAt: deals.createdAt,
      actualCloseDate: deals.actualCloseDate,
    })
    .from(deals)
    .where(
      and(eq(deals.orgId, orgId), eq(deals.pipelineId, pipelineId), gte(deals.createdAt, since)),
    );

  let totalWon = 0,
    countWon = 0,
    totalLost = 0,
    countLost = 0;
  for (const r of rows) {
    if (!r.actualCloseDate) continue;
    const deltaDays = (r.actualCloseDate.getTime() - r.createdAt.getTime()) / 86400_000;
    if (r.status === 'won') {
      totalWon += deltaDays;
      countWon++;
    }
    if (r.status === 'lost') {
      totalLost += deltaDays;
      countLost++;
    }
  }

  return {
    avgDaysToWin: countWon > 0 ? Math.round((totalWon / countWon) * 10) / 10 : 0,
    avgDaysToLose: countLost > 0 ? Math.round((totalLost / countLost) * 10) / 10 : 0,
    sampleWon: countWon,
    sampleLost: countLost,
  };
}

export interface RepPerformance {
  ownerUserId: string | null;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  wonValue: number;
  winRate: number;
}

export async function repPerformance(orgId: string, days = 180): Promise<RepPerformance[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      ownerUserId: deals.ownerUserId,
      status: deals.status,
      value: deals.value,
    })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), gte(deals.createdAt, since), isNull(deals.deletedAt)));

  const byOwner = new Map<
    string | null,
    { open: number; won: number; lost: number; wonValue: number }
  >();
  for (const r of rows) {
    const key = r.ownerUserId;
    const entry = byOwner.get(key) ?? { open: 0, won: 0, lost: 0, wonValue: 0 };
    if (r.status === 'open') entry.open++;
    if (r.status === 'won') {
      entry.won++;
      entry.wonValue += Number(r.value);
    }
    if (r.status === 'lost') entry.lost++;
    byOwner.set(key, entry);
  }

  return [...byOwner.entries()]
    .map(([ownerUserId, e]) => {
      const closed = e.won + e.lost;
      return {
        ownerUserId,
        openDeals: e.open,
        wonDeals: e.won,
        lostDeals: e.lost,
        wonValue: Math.round(e.wonValue * 100) / 100,
        winRate: closed > 0 ? Math.round((e.won / closed) * 10000) / 10000 : 0,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue);
}

export interface WinLossAnalysis {
  totalClosed: number;
  won: number;
  lost: number;
  winRate: number;
  lostReasons: Array<{ reason: string; count: number; percent: number }>;
  bySource: Array<{ source: string | null; won: number; lost: number; winRate: number }>;
}

export async function winLossAnalysis(orgId: string, days = 180): Promise<WinLossAnalysis> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      status: deals.status,
      lostReason: deals.lostReason,
      source: deals.source,
    })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        gte(deals.createdAt, since),
        sql`${deals.status} IN ('won', 'lost')`,
        isNull(deals.deletedAt),
      ),
    );

  const won = rows.filter((r) => r.status === 'won').length;
  const lost = rows.filter((r) => r.status === 'lost').length;
  const total = won + lost;

  const reasonMap = new Map<string, number>();
  for (const r of rows) {
    if (r.status === 'lost') {
      const reason = r.lostReason ?? 'unspecified';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    }
  }

  const lostReasons = [...reasonMap.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      percent: lost > 0 ? Math.round((count / lost) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const sourceMap = new Map<string | null, { won: number; lost: number }>();
  for (const r of rows) {
    const key = r.source ?? null;
    const entry = sourceMap.get(key) ?? { won: 0, lost: 0 };
    if (r.status === 'won') entry.won++;
    else if (r.status === 'lost') entry.lost++;
    sourceMap.set(key, entry);
  }

  const bySource = [...sourceMap.entries()]
    .map(([source, e]) => ({
      source,
      won: e.won,
      lost: e.lost,
      winRate: e.won + e.lost > 0 ? Math.round((e.won / (e.won + e.lost)) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.won + b.lost - (a.won + a.lost));

  return {
    totalClosed: total,
    won,
    lost,
    winRate: total > 0 ? Math.round((won / total) * 10000) / 10000 : 0,
    lostReasons,
    bySource,
  };
}
