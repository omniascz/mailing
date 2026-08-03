/**
 * Historical subject line performance scorer.
 *
 * Analyses past campaigns' subject lines and open rates to extract
 * feature-level signal (emoji presence, question marks, length buckets,
 * power words, personalisation tokens, etc.) then scores new candidates
 * against those patterns.
 *
 * This gives the AI subject line endpoint a real data anchor instead of
 * purely heuristic Claude scores.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { redis } from '../../lib/redis.js';

const LOOKBACK_DAYS = 180;
const MIN_SENDS_FOR_SIGNAL = 100;
const CACHE_TTL = 3600 * 6; // 6h

// ─── Feature extraction ────────────────────────────────────────────────────

interface SubjectFeatures {
  hasEmoji: boolean;
  hasQuestion: boolean;
  hasNumber: boolean;
  hasPersonalisation: boolean; // {{first_name}} etc.
  hasUrgency: boolean;
  hasBrackets: boolean;
  lengthBucket: 'short' | 'medium' | 'long'; // <30 / 30-60 / >60
  wordCount: number;
  startsWithVerb: boolean;
}

const URGENCY_WORDS = /\b(urgent|last chance|expires|ending soon|today only|now|limited|hurry)\b/i;
const VERB_STARTS = /^(get|discover|learn|save|unlock|join|try|start|claim|grab|see|check)\b/i;
const EMOJI_RE = /\p{Emoji_Presentation}/u;

function extractFeatures(subject: string): SubjectFeatures {
  const len = subject.length;
  return {
    hasEmoji: EMOJI_RE.test(subject),
    hasQuestion: subject.includes('?'),
    hasNumber: /\d/.test(subject),
    hasPersonalisation: /\{\{/.test(subject),
    hasUrgency: URGENCY_WORDS.test(subject),
    hasBrackets: /[[(]/.test(subject),
    lengthBucket: len < 30 ? 'short' : len <= 60 ? 'medium' : 'long',
    wordCount: subject.trim().split(/\s+/).length,
    startsWithVerb: VERB_STARTS.test(subject.trim()),
  };
}

// ─── Org-level feature performance model ──────────────────────────────────

export interface FeaturePerformance {
  feature: string;
  avgOpenRate: number;
  sampleSize: number;
  lift: number; // vs. org baseline (positive = better)
}

export interface OrgSubjectModel {
  baselineOpenRate: number;
  featureSignals: FeaturePerformance[];
  sampleCampaigns: number;
  windowDays: number;
}

export async function buildOrgSubjectModel(orgId: string): Promise<OrgSubjectModel> {
  const cacheKey = `sto:subject-model:${orgId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as OrgSubjectModel;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

  // Fetch campaigns with enough send volume for signal
  const rows = (await db.execute(sql`
    SELECT
      c.id,
      c.subject,
      COUNT(CASE WHEN e.event_type = 'send' THEN 1 END)::int         AS sends,
      COUNT(CASE WHEN e.event_type = 'open' AND e.is_bot IS NOT TRUE THEN 1 END)::int AS opens
    FROM campaigns c
    JOIN email_events e ON e.campaign_id = c.id AND e.org_id = ${orgId}
    WHERE c.org_id = ${orgId}
      AND c.status = 'sent'
      AND c.created_at >= ${since}
      AND c.subject IS NOT NULL
    GROUP BY c.id, c.subject
    HAVING COUNT(CASE WHEN e.event_type = 'send' THEN 1 END) >= ${MIN_SENDS_FOR_SIGNAL}
  `)) as unknown as {
    rows: Array<{ id: string; subject: string; sends: number; opens: number }>;
  };

  const campaignRows = rows.rows ?? [];
  if (campaignRows.length < 3) {
    // Not enough history — return neutral model
    return { baselineOpenRate: 0.22, featureSignals: [], sampleCampaigns: 0, windowDays: LOOKBACK_DAYS };
  }

  const withRate = campaignRows.map((r) => ({
    ...r,
    openRate: r.sends > 0 ? r.opens / r.sends : 0,
    features: extractFeatures(r.subject),
  }));

  const baseline = withRate.reduce((acc, r) => acc + r.openRate, 0) / withRate.length;

  // For each boolean feature, compute avg open rate when present vs. absent
  const FEATURES: Array<[string, (f: SubjectFeatures) => boolean]> = [
    ['emoji', (f) => f.hasEmoji],
    ['question', (f) => f.hasQuestion],
    ['number', (f) => f.hasNumber],
    ['personalisation', (f) => f.hasPersonalisation],
    ['urgency', (f) => f.hasUrgency],
    ['brackets', (f) => f.hasBrackets],
    ['short_subject', (f) => f.lengthBucket === 'short'],
    ['medium_subject', (f) => f.lengthBucket === 'medium'],
    ['long_subject', (f) => f.lengthBucket === 'long'],
    ['starts_with_verb', (f) => f.startsWithVerb],
  ];

  const featureSignals: FeaturePerformance[] = [];
  for (const [name, test] of FEATURES) {
    const matching = withRate.filter((r) => test(r.features));
    if (matching.length < 2) continue;
    const avgOpenRate = matching.reduce((acc, r) => acc + r.openRate, 0) / matching.length;
    featureSignals.push({
      feature: name,
      avgOpenRate,
      sampleSize: matching.length,
      lift: avgOpenRate - baseline,
    });
  }

  const model: OrgSubjectModel = {
    baselineOpenRate: baseline,
    featureSignals,
    sampleCampaigns: campaignRows.length,
    windowDays: LOOKBACK_DAYS,
  };

  await redis.set(cacheKey, JSON.stringify(model), 'EX', CACHE_TTL).catch(() => {});
  return model;
}

// ─── Score candidates ──────────────────────────────────────────────────────

export interface ScoredSubjectLine {
  subject: string;
  predictedOpenRate: number;
  confidence: 'high' | 'medium' | 'low';
  lift: number; // vs. baseline, e.g. +0.04 = +4pp
  signals: string[]; // which features contributed
  dataScore: number; // 0-10 data-backed score (complements AI score)
}

export async function scoreSubjectLines(
  orgId: string,
  candidates: string[],
): Promise<ScoredSubjectLine[]> {
  const model = await buildOrgSubjectModel(orgId);

  return candidates.map((subject) => {
    const features = extractFeatures(subject);
    const signals: string[] = [];
    let lift = 0;

    for (const sig of model.featureSignals) {
      const featureMap: Record<string, boolean> = {
        emoji: features.hasEmoji,
        question: features.hasQuestion,
        number: features.hasNumber,
        personalisation: features.hasPersonalisation,
        urgency: features.hasUrgency,
        brackets: features.hasBrackets,
        short_subject: features.lengthBucket === 'short',
        medium_subject: features.lengthBucket === 'medium',
        long_subject: features.lengthBucket === 'long',
        starts_with_verb: features.startsWithVerb,
      };
      if (featureMap[sig.feature] && Math.abs(sig.lift) > 0.01) {
        lift += sig.lift;
        if (sig.lift > 0.01) signals.push(`+${sig.feature}`);
        else if (sig.lift < -0.01) signals.push(`-${sig.feature}`);
      }
    }

    const predictedOpenRate = Math.max(0, Math.min(1, model.baselineOpenRate + lift));
    const confidence =
      model.sampleCampaigns >= 20 ? 'high'
      : model.sampleCampaigns >= 5 ? 'medium'
      : 'low';

    const dataScore = Math.round(
      Math.min(10, Math.max(1, 5 + (lift / 0.05) * 2)),
    );

    return { subject, predictedOpenRate, confidence, lift, signals, dataScore };
  });
}

// ─── Route helper: enrich AI variants with historical scores ───────────────

export interface EnrichedVariant {
  subject: string;
  aiScore: number;
  aiReason: string;
  dataScore: number;
  predictedOpenRate: number;
  confidence: 'high' | 'medium' | 'low';
  lift: number;
  signals: string[];
  /** Combined rank: weighted average of AI + data scores */
  combinedScore: number;
}

export async function enrichVariantsWithHistory(
  orgId: string,
  variants: Array<{ subject: string; score: number; reason: string }>,
): Promise<EnrichedVariant[]> {
  const subjects = variants.map((v) => v.subject);
  const scored = await scoreSubjectLines(orgId, subjects);
  const scoreMap = new Map(scored.map((s) => [s.subject, s]));

  return variants
    .map((v) => {
      const data = scoreMap.get(v.subject);
      const dataScore = data?.dataScore ?? 5;
      const combinedScore =
        Math.round(
          (data && data.confidence !== 'low'
            ? v.score * 0.4 + dataScore * 0.6
            : v.score * 0.7 + dataScore * 0.3) * 10,
        ) / 10;
      return {
        subject: v.subject,
        aiScore: v.score,
        aiReason: v.reason,
        dataScore,
        predictedOpenRate: data?.predictedOpenRate ?? 0,
        confidence: data?.confidence ?? 'low',
        lift: data?.lift ?? 0,
        signals: data?.signals ?? [],
        combinedScore,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}
