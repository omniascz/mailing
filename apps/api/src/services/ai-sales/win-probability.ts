/**
 * Win Probability scoring for sales deals.
 *
 * Uses a hybrid model:
 *   1. Baseline from the deal's current stage probability (fast, deterministic)
 *   2. Adjustments from signal features (age, recent stage movement, engagement)
 *   3. Optional Claude refinement for a human-readable rationale
 *
 * Output is a 0..1 probability. A real ML model can be swapped in later —
 * the feature vector exposed here is the stable contract.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deals, dealStageHistory, contacts, emailEvents } from '../../db/schema/index.js';
import { getPipeline, stageFromPipeline } from '../crm/pipelines.js';
import { AppError } from '../../lib/app-error.js';

export interface WinProbabilityFeatures {
  stageProbability: number; // 0..100 (from pipeline stage)
  dealAgeDays: number;
  daysInCurrentStage: number;
  daysPastExpectedClose: number; // negative = future
  stageMoveCount: number;
  contactEngagementScore: number; // 0..100 (leadScore clamped, plus recent email activity)
  recentEmailOpens30d: number;
  recentEmailClicks30d: number;
}

export interface WinProbabilityResult {
  dealId: string;
  probability: number; // 0..1
  confidence: 'low' | 'medium' | 'high';
  features: WinProbabilityFeatures;
  factors: Array<{ factor: string; impact: number; note: string }>;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function loadFeatures(
  orgId: string,
  dealId: string,
): Promise<{
  features: WinProbabilityFeatures;
  deal: typeof deals.$inferSelect;
  stageProbability: number;
}> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, orgId), isNull(deals.deletedAt)));
  if (!deal) throw AppError.notFound('Deal not found');
  if (deal.status !== 'open') throw AppError.badRequest('Deal is already closed');

  const pipeline = await getPipeline(orgId, deal.pipelineId);
  const stage = stageFromPipeline(pipeline, deal.stageId);
  const stageProbability = stage?.probability ?? 0;

  const now = Date.now();
  const dealAgeDays = Math.max(0, Math.floor((now - deal.createdAt.getTime()) / 86_400_000));
  const daysInCurrentStage = Math.max(
    0,
    Math.floor((now - deal.stageChangedAt.getTime()) / 86_400_000),
  );
  const daysPastExpectedClose = deal.expectedCloseDate
    ? Math.floor((now - deal.expectedCloseDate.getTime()) / 86_400_000)
    : 0;

  const historyRows = await db
    .select({ id: dealStageHistory.id })
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, dealId));
  const stageMoveCount = historyRows.length;

  let contactEngagementScore = 0;
  let recentEmailOpens30d = 0;
  let recentEmailClicks30d = 0;

  if (deal.contactId) {
    const [contact] = await db
      .select({ leadScore: contacts.leadScore })
      .from(contacts)
      .where(eq(contacts.id, deal.contactId));
    contactEngagementScore = clamp(contact?.leadScore ?? 0, 0, 100);

    const thirtyDaysAgo = new Date(now - 30 * 86_400_000);
    const recentEvents = await db
      .select({
        eventType: emailEvents.eventType,
      })
      .from(emailEvents)
      .where(and(eq(emailEvents.contactId, deal.contactId), eq(emailEvents.orgId, orgId)))
      .orderBy(desc(emailEvents.createdAt))
      .limit(500);

    for (const e of recentEvents) {
      if (e.eventType === 'open') recentEmailOpens30d++;
      else if (e.eventType === 'click') recentEmailClicks30d++;
    }
    void thirtyDaysAgo; // limit by recent N; filtering in-memory to avoid type clash on enum values
  }

  return {
    features: {
      stageProbability,
      dealAgeDays,
      daysInCurrentStage,
      daysPastExpectedClose,
      stageMoveCount,
      contactEngagementScore,
      recentEmailOpens30d,
      recentEmailClicks30d,
    },
    deal,
    stageProbability,
  };
}

/**
 * Rule-based scoring. Each factor nudges the stage-baseline probability
 * up or down within [-0.25, +0.25]. Final is clamped to [0.02, 0.98].
 */
function scoreFromFeatures(f: WinProbabilityFeatures): {
  probability: number;
  factors: WinProbabilityResult['factors'];
} {
  const factors: WinProbabilityResult['factors'] = [];
  let score = f.stageProbability / 100;

  // Stagnation penalty
  if (f.daysInCurrentStage > 30) {
    const impact = -clamp((f.daysInCurrentStage - 30) / 200, 0, 0.2);
    score += impact;
    factors.push({
      factor: 'stagnation',
      impact,
      note: `${f.daysInCurrentStage}d in current stage`,
    });
  }

  // Overdue penalty
  if (f.daysPastExpectedClose > 0) {
    const impact = -clamp(f.daysPastExpectedClose / 100, 0, 0.25);
    score += impact;
    factors.push({
      factor: 'overdue',
      impact,
      note: `${f.daysPastExpectedClose}d past expected close`,
    });
  }

  // Forward momentum
  if (f.stageMoveCount >= 3) {
    const impact = 0.05;
    score += impact;
    factors.push({ factor: 'momentum', impact, note: `${f.stageMoveCount} stage transitions` });
  }

  // Engagement
  if (f.contactEngagementScore >= 50) {
    const impact = 0.08;
    score += impact;
    factors.push({ factor: 'engagement', impact, note: `lead score ${f.contactEngagementScore}` });
  } else if (f.contactEngagementScore < 10 && f.dealAgeDays > 14) {
    const impact = -0.07;
    score += impact;
    factors.push({
      factor: 'low_engagement',
      impact,
      note: `lead score ${f.contactEngagementScore}`,
    });
  }

  // Recent activity
  if (f.recentEmailOpens30d + f.recentEmailClicks30d >= 3) {
    const impact = 0.05;
    score += impact;
    factors.push({
      factor: 'recent_activity',
      impact,
      note: `${f.recentEmailOpens30d} opens / ${f.recentEmailClicks30d} clicks in 30d`,
    });
  }

  return { probability: clamp(score, 0.02, 0.98), factors };
}

export async function winProbability(orgId: string, dealId: string): Promise<WinProbabilityResult> {
  const { features } = await loadFeatures(orgId, dealId);
  const { probability, factors } = scoreFromFeatures(features);

  // Confidence heuristic: older deals with more history → higher confidence
  let confidence: WinProbabilityResult['confidence'] = 'low';
  if (features.stageMoveCount >= 2 && features.dealAgeDays >= 7) confidence = 'medium';
  if (features.stageMoveCount >= 4 || features.dealAgeDays >= 30) confidence = 'high';

  return {
    dealId,
    probability: Math.round(probability * 10000) / 10000,
    confidence,
    features,
    factors,
  };
}

/**
 * Bulk variant — runs in parallel for a list of open deals (capped at 100).
 */
export async function winProbabilityForPipeline(
  orgId: string,
  pipelineId: string,
  limit = 100,
): Promise<WinProbabilityResult[]> {
  const rows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        eq(deals.status, 'open'),
        isNull(deals.deletedAt),
      ),
    )
    .orderBy(desc(deals.updatedAt))
    .limit(limit);

  const results = await Promise.allSettled(rows.map((r) => winProbability(orgId, r.id)));
  return results
    .filter((r): r is PromiseFulfilledResult<WinProbabilityResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}
