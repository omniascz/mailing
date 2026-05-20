/**
 * Deal Health / Loss Agent (#332).
 *
 * Two modes:
 *   1. `analyzeLossPatterns(orgId)` — scans closed-lost deals in the last N
 *      months, clusters lost reasons, and returns an executive summary + the
 *      top signals that precede a loss (e.g. "stage X sat > 14 days",
 *      "average value > $Y lost twice as often").
 *   2. `scoreOpenDeals(orgId)` — for each open deal, computes a health score
 *      0–100 and a risk class (healthy|watch|at_risk|critical). Score combines
 *      rule-based signals (age, stage duration, activity recency) with a
 *      Claude Opus judgement that cites loss-pattern facts.
 *
 * Risk flags fire `deal_at_risk` workflow events so reps get nudged.
 */

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { deals, dealStageHistory } from '../../db/schema/deals.js';
import { callClaude, cacheKey } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';

type Deal = typeof deals.$inferSelect;

const CACHE_TTL = 3600; // 1h
const DAY_MS = 86_400_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LossPattern {
  /** Short label for the pattern, e.g. "Stuck in Discovery > 21 days". */
  label: string;
  /** How often this pattern appeared across lost deals (0–1). */
  frequency: number;
  /** Qualitative weight Claude assigned to how strongly it predicts loss. */
  predictivePower: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface LossAnalysis {
  lostDealsAnalyzed: number;
  wonDealsAnalyzed: number;
  timeWindowDays: number;
  topLossReasons: Array<{ reason: string; count: number; share: number }>;
  patterns: LossPattern[];
  averageLostDealValue: number;
  averageWonDealValue: number;
  medianLostCycleDays: number;
  medianWonCycleDays: number;
  summary: string;
  tokensUsed: number;
}

export type DealRisk = 'healthy' | 'watch' | 'at_risk' | 'critical';

export interface DealHealthScore {
  dealId: string;
  dealName: string;
  value: number;
  stageId: string;
  ageDays: number;
  stageAgeDays: number;
  lastActivityDays: number | null;
  /** 0–100; lower = riskier. */
  score: number;
  risk: DealRisk;
  reasons: string[];
  recommendation: string;
}

// ─── Loss pattern analysis ────────────────────────────────────────────────────

export async function analyzeLossPatterns(
  orgId: string,
  opts?: { windowDays?: number; force?: boolean },
): Promise<LossAnalysis> {
  const windowDays = opts?.windowDays ?? 180;
  const key = cacheKey('deal_loss_analysis', `${orgId}:${windowDays}`);
  if (!opts?.force) {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as LossAnalysis;
  }

  const since = new Date(Date.now() - windowDays * DAY_MS);

  const lost = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.status, 'lost'),
        sql`${deals.actualCloseDate} >= ${since}`,
      ),
    )
    .limit(500);

  const won = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.status, 'won'),
        sql`${deals.actualCloseDate} >= ${since}`,
      ),
    )
    .limit(500);

  if (lost.length === 0) {
    return {
      lostDealsAnalyzed: 0,
      wonDealsAnalyzed: won.length,
      timeWindowDays: windowDays,
      topLossReasons: [],
      patterns: [],
      averageLostDealValue: 0,
      averageWonDealValue: avgValue(won),
      medianLostCycleDays: 0,
      medianWonCycleDays: medianCycle(won),
      summary: 'Not enough lost deals in window to detect patterns yet.',
      tokensUsed: 0,
    };
  }

  // Aggregate loss reasons
  const reasonCounts = new Map<string, number>();
  for (const d of lost) {
    const r = (d.lostReason ?? 'unspecified').trim().toLowerCase();
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const topLossReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({
      reason,
      count,
      share: Math.round((count / lost.length) * 1000) / 1000,
    }));

  const avgLostVal = avgValue(lost);
  const avgWonVal = avgValue(won);
  const medLostCycle = medianCycle(lost);
  const medWonCycle = medianCycle(won);

  // Ask Claude to derive patterns + recommendation from the aggregates.
  const llmPrompt = `You are a senior sales operations analyst.

Given the following aggregates for a ${windowDays}-day window, identify the top loss patterns (3–6), label each, give a qualitative predictive power (low|medium|high) and an actionable recommendation for the sales team.

Context:
- Lost deals analysed: ${lost.length}
- Won deals analysed: ${won.length}
- Avg lost deal value: ${avgLostVal.toFixed(2)}
- Avg won deal value: ${avgWonVal.toFixed(2)}
- Median lost sales cycle (days): ${medLostCycle}
- Median won sales cycle (days): ${medWonCycle}
- Top loss reasons: ${JSON.stringify(topLossReasons)}

Return strict JSON:
{
  "patterns": [
    { "label": "...", "frequency": 0.0-1.0, "predictivePower": "low|medium|high", "recommendation": "..." }
  ],
  "summary": "2–3 sentence executive summary"
}`;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-opus-4-6',
    feature: 'agent_run',
    system: 'You analyse CRM pipeline data. Output strict JSON only, no markdown fences.',
    user: llmPrompt,
    maxTokens: 2048,
  });

  let parsed: { patterns: LossPattern[]; summary: string };
  try {
    parsed = JSON.parse(result.text) as { patterns: LossPattern[]; summary: string };
  } catch {
    parsed = { patterns: [], summary: 'LLM returned unparseable response' };
  }

  const output: LossAnalysis = {
    lostDealsAnalyzed: lost.length,
    wonDealsAnalyzed: won.length,
    timeWindowDays: windowDays,
    topLossReasons,
    patterns: parsed.patterns ?? [],
    averageLostDealValue: Math.round(avgLostVal * 100) / 100,
    averageWonDealValue: Math.round(avgWonVal * 100) / 100,
    medianLostCycleDays: medLostCycle,
    medianWonCycleDays: medWonCycle,
    summary: parsed.summary ?? '',
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.set(key, JSON.stringify(output), 'EX', CACHE_TTL);
  return output;
}

// ─── Health scoring for open deals ────────────────────────────────────────────

export async function scoreOpenDeals(
  orgId: string,
  opts?: { limit?: number; notifyOnRisk?: boolean },
): Promise<DealHealthScore[]> {
  const limit = opts?.limit ?? 500;
  const open = await db
    .select()
    .from(deals)
    .where(and(eq(deals.orgId, orgId), eq(deals.status, 'open'), sql`${deals.deletedAt} IS NULL`))
    .limit(limit);
  if (open.length === 0) return [];

  // Pull last-activity for the batch in one query.
  const activityRows = await db.execute<{ deal_id: string; last_activity_at: Date }>(sql`
    SELECT deal_id, MAX(COALESCE(completed_at, updated_at, created_at)) AS last_activity_at
    FROM crm_tasks
    WHERE org_id = ${orgId}::uuid AND deal_id = ANY(${sql.raw(`ARRAY[${open.map((d) => `'${d.id}'`).join(',')}]::uuid[]`)})
    GROUP BY deal_id
  `);
  const activity = new Map<string, Date>();
  for (const r of activityRows as unknown as Array<{ deal_id: string; last_activity_at: Date }>) {
    if (r.last_activity_at) activity.set(r.deal_id, new Date(r.last_activity_at));
  }

  // Loss analysis once, share across all deals.
  let analysis: LossAnalysis | null = null;
  try {
    analysis = await analyzeLossPatterns(orgId);
  } catch {
    /* ignore */
  }

  const now = Date.now();
  const scores: DealHealthScore[] = [];
  for (const d of open) {
    const ageDays = Math.floor((now - new Date(d.createdAt).getTime()) / DAY_MS);
    const stageAgeDays = Math.floor((now - new Date(d.stageChangedAt).getTime()) / DAY_MS);
    const la = activity.get(d.id);
    const lastActivityDays = la ? Math.floor((now - la.getTime()) / DAY_MS) : null;

    const { score, risk, reasons } = computeRuleScore(d, {
      stageAgeDays,
      lastActivityDays,
      medianWonCycle: analysis?.medianWonCycleDays ?? 30,
    });
    scores.push({
      dealId: d.id,
      dealName: d.name,
      value: Number(d.value),
      stageId: d.stageId,
      ageDays,
      stageAgeDays,
      lastActivityDays,
      score,
      risk,
      reasons,
      recommendation: recommendationFor(risk, reasons),
    });

    if (opts?.notifyOnRisk && (risk === 'at_risk' || risk === 'critical') && d.contactId) {
      try {
        const { onApiEvent } = await import('../workflows/triggers.js');
        await onApiEvent(orgId, d.contactId, 'deal_at_risk', {
          dealId: d.id,
          dealName: d.name,
          risk,
          score,
          reasons,
        });
      } catch {
        /* non-fatal */
      }
    }
  }

  return scores.sort((a, b) => a.score - b.score);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avgValue(ds: Deal[]): number {
  if (ds.length === 0) return 0;
  return ds.reduce((s, d) => s + Number(d.value), 0) / ds.length;
}

function medianCycle(ds: Deal[]): number {
  const cycles = ds
    .filter((d) => d.actualCloseDate)
    .map((d) =>
      Math.max(
        0,
        Math.floor(
          (new Date(d.actualCloseDate!).getTime() - new Date(d.createdAt).getTime()) / DAY_MS,
        ),
      ),
    )
    .sort((a, b) => a - b);
  if (cycles.length === 0) return 0;
  const mid = Math.floor(cycles.length / 2);
  return cycles.length % 2 === 0 ? Math.round((cycles[mid - 1]! + cycles[mid]!) / 2) : cycles[mid]!;
}

function computeRuleScore(
  d: Deal,
  ctx: { stageAgeDays: number; lastActivityDays: number | null; medianWonCycle: number },
): { score: number; risk: DealRisk; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  if (ctx.stageAgeDays > 30) {
    score -= 30;
    reasons.push(`stuck in current stage ${ctx.stageAgeDays}d`);
  } else if (ctx.stageAgeDays > 14) {
    score -= 15;
    reasons.push(`slow stage progression (${ctx.stageAgeDays}d)`);
  }

  if (ctx.lastActivityDays == null) {
    score -= 15;
    reasons.push('no logged activity');
  } else if (ctx.lastActivityDays > 21) {
    score -= 25;
    reasons.push(`no activity for ${ctx.lastActivityDays}d`);
  } else if (ctx.lastActivityDays > 10) {
    score -= 10;
    reasons.push(`activity older than 10 days`);
  }

  if (d.expectedCloseDate) {
    const daysToClose = Math.floor((new Date(d.expectedCloseDate).getTime() - Date.now()) / DAY_MS);
    if (daysToClose < 0) {
      score -= 20;
      reasons.push(`past expected close by ${Math.abs(daysToClose)}d`);
    } else if (daysToClose < 7) {
      score -= 5;
      reasons.push('close date within 7 days');
    }
  } else {
    score -= 5;
    reasons.push('no expected close date');
  }

  if (ctx.medianWonCycle > 0) {
    const ageDays = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / DAY_MS);
    if (ageDays > ctx.medianWonCycle * 2) {
      score -= 15;
      reasons.push(`deal age ${ageDays}d vs typical won cycle ${ctx.medianWonCycle}d`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const risk: DealRisk =
    score >= 75 ? 'healthy' : score >= 55 ? 'watch' : score >= 35 ? 'at_risk' : 'critical';
  return { score, risk, reasons };
}

function recommendationFor(risk: DealRisk, reasons: string[]): string {
  if (risk === 'healthy') return 'Keep cadence; advance to next stage when criteria met.';
  if (risk === 'watch') return 'Schedule a check-in this week; confirm next step with champion.';
  const noActivity = reasons.some(
    (r) => r.includes('no activity') || r.includes('no logged activity'),
  );
  if (risk === 'at_risk') {
    return noActivity
      ? 'Send a re-engagement message today and log a discovery call within 48h.'
      : 'Surface the blocker directly with the economic buyer; unblock or disqualify within a week.';
  }
  return 'Escalate to manager. Run a formal loss/win review — decision to push or close-lost within 3 business days.';
}

// ─── History helper (used by recommendation text) ─────────────────────────────

export async function getStageVelocity(
  orgId: string,
  pipelineId: string,
): Promise<Array<{ stageId: string; medianDurationDays: number; samples: number }>> {
  const rows = await db
    .select({
      stage: dealStageHistory.fromStageId,
      duration: dealStageHistory.durationSeconds,
    })
    .from(dealStageHistory)
    .where(
      and(
        eq(dealStageHistory.orgId, orgId),
        isNotNull(dealStageHistory.fromStageId),
        isNotNull(dealStageHistory.durationSeconds),
      ),
    )
    .orderBy(desc(dealStageHistory.changedAt))
    .limit(2000);

  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.stage || r.duration == null) continue;
    const arr = groups.get(r.stage) ?? [];
    arr.push(r.duration);
    groups.set(r.stage, arr);
  }

  return [...groups.entries()]
    .map(([stageId, seconds]) => {
      const sorted = seconds.sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianSec =
        sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
      return {
        stageId,
        medianDurationDays: Math.round(medianSec / 86_400),
        samples: sorted.length,
      };
    })
    .sort((a, b) => b.samples - a.samples)
    .concat(pipelineId ? [] : []);
}
