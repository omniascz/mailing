/**
 * Deal risk assessment — surfaces stalled / at-risk open deals.
 *
 * Flags (any combination raises overall risk):
 *   - stalled:      no stage change for N days
 *   - overdue:      past expected close date
 *   - silent:       no activity (emails, stage moves) for N days
 *   - owner_idle:   no recent touches from the deal owner
 *   - high_value:   amplifies severity when deal value is large
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deals, dealStageHistory, emailEvents } from '../../db/schema/index.js';

export interface DealRiskFlags {
  stalled: boolean;
  overdue: boolean;
  silent: boolean;
  highValue: boolean;
}

export interface DealRiskResult {
  dealId: string;
  name: string;
  ownerUserId: string | null;
  value: number;
  currency: string;
  pipelineId: string;
  stageId: string;
  severity: 'low' | 'medium' | 'high';
  riskScore: number; // 0..100
  flags: DealRiskFlags;
  reasons: string[];
  daysInCurrentStage: number;
  daysSinceLastActivity: number;
  daysPastExpectedClose: number;
}

export interface DealRiskOptions {
  stalledDays?: number; // default 30
  silentDays?: number; // default 21
  highValueThreshold?: number; // default 10_000
  limit?: number; // default 200
}

/** Pure risk scoring from the deal's day-counts + value. Unit-tested. */
export function scoreDealRisk(
  input: {
    daysInCurrentStage: number;
    daysPastExpectedClose: number;
    daysSinceLastActivity: number;
    value: number;
    currency: string;
  },
  opts: { stalledDays?: number; silentDays?: number; highValueThreshold?: number } = {},
): {
  flags: DealRiskFlags;
  riskScore: number;
  severity: DealRiskResult['severity'];
  reasons: string[];
} {
  const stalledDays = opts.stalledDays ?? 30;
  const silentDays = opts.silentDays ?? 21;
  const highValueThreshold = opts.highValueThreshold ?? 10_000;

  const flags: DealRiskFlags = {
    stalled: input.daysInCurrentStage >= stalledDays,
    overdue: input.daysPastExpectedClose > 0,
    silent: input.daysSinceLastActivity >= silentDays,
    highValue: input.value >= highValueThreshold,
  };

  const reasons: string[] = [];
  let score = 0;
  if (flags.stalled) {
    score += 30;
    reasons.push(`Stalled ${input.daysInCurrentStage}d in current stage`);
  }
  if (flags.overdue) {
    score += 35;
    reasons.push(`${input.daysPastExpectedClose}d past expected close`);
  }
  if (flags.silent) {
    score += 20;
    reasons.push(`No activity for ${input.daysSinceLastActivity}d`);
  }
  if (flags.highValue && (flags.stalled || flags.overdue || flags.silent)) {
    score += 15;
    reasons.push(`High-value deal (${input.value} ${input.currency})`);
  }
  score = Math.min(100, score);

  let severity: DealRiskResult['severity'] = 'low';
  if (score >= 60) severity = 'high';
  else if (score >= 30) severity = 'medium';

  return { flags, riskScore: score, severity, reasons };
}

async function lastActivity(
  orgId: string,
  dealId: string,
  contactId: string | null,
): Promise<Date | null> {
  const [lastStage] = await db
    .select({ changedAt: dealStageHistory.changedAt })
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, dealId))
    .orderBy(desc(dealStageHistory.changedAt))
    .limit(1);

  let lastContactEvent: Date | null = null;
  if (contactId) {
    const [ev] = await db
      .select({ createdAt: emailEvents.createdAt })
      .from(emailEvents)
      .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.contactId, contactId)))
      .orderBy(desc(emailEvents.createdAt))
      .limit(1);
    lastContactEvent = ev?.createdAt ?? null;
  }

  const candidates = [lastStage?.changedAt ?? null, lastContactEvent].filter(
    (d): d is Date => d !== null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
}

export async function assessDealRisk(
  orgId: string,
  dealId: string,
  opts: DealRiskOptions = {},
): Promise<DealRiskResult | null> {
  const stalledDays = opts.stalledDays ?? 30;
  const silentDays = opts.silentDays ?? 21;
  const highValueThreshold = opts.highValueThreshold ?? 10_000;

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, orgId), isNull(deals.deletedAt)));
  if (!deal || deal.status !== 'open') return null;

  const now = Date.now();
  const daysInCurrentStage = Math.max(
    0,
    Math.floor((now - deal.stageChangedAt.getTime()) / 86_400_000),
  );
  const daysPastExpectedClose = deal.expectedCloseDate
    ? Math.floor((now - deal.expectedCloseDate.getTime()) / 86_400_000)
    : 0;

  const lastAct = await lastActivity(orgId, deal.id, deal.contactId);
  const daysSinceLastActivity = lastAct
    ? Math.max(0, Math.floor((now - lastAct.getTime()) / 86_400_000))
    : daysInCurrentStage;

  const value = Number(deal.value);
  const { flags, riskScore, severity, reasons } = scoreDealRisk(
    {
      daysInCurrentStage,
      daysPastExpectedClose,
      daysSinceLastActivity,
      value,
      currency: deal.currency,
    },
    { stalledDays, silentDays, highValueThreshold },
  );

  return {
    dealId: deal.id,
    name: deal.name,
    ownerUserId: deal.ownerUserId,
    value,
    currency: deal.currency,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    severity,
    riskScore,
    flags,
    reasons,
    daysInCurrentStage,
    daysSinceLastActivity,
    daysPastExpectedClose,
  };
}

/**
 * Return at-risk deals across the org (or a single pipeline), sorted by severity.
 */
export async function atRiskDeals(
  orgId: string,
  opts: DealRiskOptions & { pipelineId?: string; minScore?: number } = {},
): Promise<DealRiskResult[]> {
  const limit = opts.limit ?? 200;
  const minScore = opts.minScore ?? 30;

  const staleSince = new Date(Date.now() - (opts.stalledDays ?? 30) * 86_400_000);

  const conds = [eq(deals.orgId, orgId), eq(deals.status, 'open'), isNull(deals.deletedAt)];
  if (opts.pipelineId) conds.push(eq(deals.pipelineId, opts.pipelineId));

  const rows = await db
    .select({
      id: deals.id,
      stageChangedAt: deals.stageChangedAt,
      expectedCloseDate: deals.expectedCloseDate,
    })
    .from(deals)
    .where(and(...conds))
    .limit(limit * 2);

  // Pre-filter to reduce DB reads in assessDealRisk: only deals with stale stage or past expected close
  const candidates = rows.filter(
    (r) =>
      r.stageChangedAt <= staleSince ||
      (r.expectedCloseDate && r.expectedCloseDate.getTime() < Date.now()),
  );

  const results = await Promise.allSettled(
    candidates.slice(0, limit).map((r) => assessDealRisk(orgId, r.id, opts)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<DealRiskResult | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((r): r is DealRiskResult => r !== null && r.riskScore >= minScore)
    .sort((a, b) => b.riskScore - a.riskScore);
}
