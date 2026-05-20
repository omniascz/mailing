/**
 * Sentiment Analysis for sales communications (emails / SMS / helpdesk).
 *
 * Strategy:
 *   - Fast path: rule-based lexicon scoring (no AI cost) for short snippets
 *   - Claude Haiku for nuanced passages (configurable)
 *   - Per-contact / per-deal aggregation by averaging normalized scores
 *
 * Output convention:
 *   score: -1 (very negative) .. +1 (very positive)
 *   label: 'negative' | 'neutral' | 'positive'
 */

import { callClaude, cacheKey, parseJsonSafe } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';

export type SentimentLabel = 'negative' | 'neutral' | 'positive';

export interface SentimentResult {
  score: number; // -1..1
  label: SentimentLabel;
  confidence: number; // 0..1
  keywords: string[];
  source: 'rule' | 'claude' | 'cache';
}

export interface AggregatedSentiment {
  average: number;
  label: SentimentLabel;
  samples: number;
  trend: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

// English + Czech lexicons — kept compact on purpose; extend as needed.
const POSITIVE_LEX = [
  'great',
  'excellent',
  'love',
  'amazing',
  'perfect',
  'thanks',
  'thank you',
  'awesome',
  'happy',
  'super',
  'skvělé',
  'výborné',
  'děkuji',
  'dobrý',
  'spokojen',
  'rád',
  'úžasné',
];
const NEGATIVE_LEX = [
  'bad',
  'terrible',
  'hate',
  'awful',
  'angry',
  'frustrated',
  'disappointed',
  'worst',
  'broken',
  'refund',
  'cancel',
  'špatné',
  'hrozné',
  'zklamaný',
  'nespokojen',
  'naštvaný',
  'chyba',
  'nefunguje',
  'vrátit',
];

function labelOf(score: number): SentimentLabel {
  if (score <= -0.2) return 'negative';
  if (score >= 0.2) return 'positive';
  return 'neutral';
}

export function ruleBasedSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  let positive = 0,
    negative = 0;

  for (const w of POSITIVE_LEX)
    if (lower.includes(w)) {
      positive++;
      matched.push(w);
    }
  for (const w of NEGATIVE_LEX)
    if (lower.includes(w)) {
      negative++;
      matched.push(w);
    }

  const total = positive + negative;
  if (total === 0) {
    return { score: 0, label: 'neutral', confidence: 0.3, keywords: [], source: 'rule' };
  }
  const score = (positive - negative) / Math.max(total, 3);
  const confidence = Math.min(1, 0.4 + total * 0.15);
  return {
    score: Math.max(-1, Math.min(1, score)),
    label: labelOf(score),
    confidence,
    keywords: matched,
    source: 'rule',
  };
}

const SYSTEM_PROMPT = `You are a precise sentiment analyzer for customer communications (sales emails, SMS, helpdesk tickets).
Output strict JSON only: {"score": number, "label": "negative"|"neutral"|"positive", "confidence": number, "keywords": string[]}
- score: -1 (very negative) to +1 (very positive)
- confidence: 0..1 (your certainty)
- keywords: up to 6 sentiment-carrying phrases quoted from the text
Respect the author's language (Czech or English).`;

export async function analyzeSentiment(
  orgId: string,
  text: string,
  opts: { forceAi?: boolean; model?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' } = {},
): Promise<SentimentResult> {
  const trimmed = text.trim();
  if (!trimmed) return { score: 0, label: 'neutral', confidence: 1, keywords: [], source: 'rule' };

  // Short passages → rule-based (fast + free)
  if (!opts.forceAi && trimmed.length < 80) return ruleBasedSentiment(trimmed);

  const key = cacheKey('sentiment', orgId, trimmed.slice(0, 400));
  const cached = await redis.get(key);
  if (cached) {
    return { ...(JSON.parse(cached) as SentimentResult), source: 'cache' };
  }

  const result = await callClaude({
    tenantId: orgId,
    model: opts.model ?? 'claude-haiku-4-5-20251001',
    feature: 'other',
    system: SYSTEM_PROMPT,
    user: `Analyze sentiment of the following message:\n\n"""\n${trimmed.slice(0, 4000)}\n"""`,
    maxTokens: 300,
  });

  let parsed: Omit<SentimentResult, 'source'>;
  try {
    parsed = parseJsonSafe<Omit<SentimentResult, 'source'>>(result.text);
  } catch {
    return ruleBasedSentiment(trimmed);
  }

  const clamped: SentimentResult = {
    score: Math.max(-1, Math.min(1, Number(parsed.score) || 0)),
    label: (['negative', 'neutral', 'positive'] as const).includes(parsed.label)
      ? parsed.label
      : labelOf(Number(parsed.score) || 0),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 6).map(String) : [],
    source: 'claude',
  };
  clamped.label = labelOf(clamped.score);

  await redis.set(key, JSON.stringify(clamped), 'EX', CACHE_TTL).catch(() => {});
  return clamped;
}

export function aggregateSentiment(
  scores: Array<{ score: number; at: Date }>,
): AggregatedSentiment {
  if (scores.length === 0) {
    return { average: 0, label: 'neutral', samples: 0, trend: 'insufficient_data' };
  }

  const average = scores.reduce((a, b) => a + b.score, 0) / scores.length;

  let trend: AggregatedSentiment['trend'] = 'insufficient_data';
  if (scores.length >= 4) {
    const sorted = [...scores].sort((a, b) => a.at.getTime() - b.at.getTime());
    const half = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, half);
    const newer = sorted.slice(half);
    const olderAvg = older.reduce((a, b) => a + b.score, 0) / older.length;
    const newerAvg = newer.reduce((a, b) => a + b.score, 0) / newer.length;
    const delta = newerAvg - olderAvg;
    if (delta > 0.15) trend = 'improving';
    else if (delta < -0.15) trend = 'worsening';
    else trend = 'stable';
  }

  return {
    average: Math.round(average * 10000) / 10000,
    label: labelOf(average),
    samples: scores.length,
    trend,
  };
}
