/**
 * Breeze AI agents pure helpers (#405).
 *
 * Rule-based scoring extracted from deal-health + prospecting so it can be
 * unit-tested without DB / Claude API. The agent services delegate here
 * after fetching deal/contact rows.
 */

import { slugify, estimateReadTimeMinutes, extractExcerpt } from '../blog/pure.js';

export type DealRiskLevel = 'healthy' | 'watch' | 'at_risk' | 'critical';

export interface DealHealthSignals {
  /** Days the deal has been in its current stage. */
  stageAgeDays: number;
  /** Days since the most recent activity (task/email/stage change). */
  lastActivityDays: number | null;
  /** Days until `expectedCloseDate` (negative = past). `null` when missing. */
  daysToClose: number | null;
  /** Total age of the deal. */
  ageDays: number;
  /** Historical median win-cycle for the org (days). 0 disables comparison. */
  medianWonCycleDays: number;
}

export interface DealHealthScore {
  score: number; // 0..100, 100 = healthy
  risk: DealRiskLevel;
  reasons: string[];
  recommendation: string;
}

/**
 * Score a single deal's health. Starts at 100 and subtracts penalties for
 * stalled stages, silent periods, past-due close dates, and deals running
 * much longer than the org's median win cycle.
 */
export function scoreDealHealth(signals: DealHealthSignals): DealHealthScore {
  let score = 100;
  const reasons: string[] = [];

  if (signals.stageAgeDays > 30) {
    score -= 30;
    reasons.push(`stuck in current stage ${signals.stageAgeDays}d`);
  } else if (signals.stageAgeDays > 14) {
    score -= 15;
    reasons.push(`slow stage progression (${signals.stageAgeDays}d)`);
  }

  if (signals.lastActivityDays == null) {
    score -= 15;
    reasons.push('no logged activity');
  } else if (signals.lastActivityDays > 21) {
    score -= 25;
    reasons.push(`no activity for ${signals.lastActivityDays}d`);
  } else if (signals.lastActivityDays > 10) {
    score -= 10;
    reasons.push('activity older than 10 days');
  }

  if (signals.daysToClose != null) {
    if (signals.daysToClose < 0) {
      score -= 20;
      reasons.push(`past expected close by ${Math.abs(signals.daysToClose)}d`);
    } else if (signals.daysToClose < 7) {
      score -= 5;
      reasons.push('close date within 7 days');
    }
  } else {
    score -= 5;
    reasons.push('no expected close date');
  }

  if (signals.medianWonCycleDays > 0 && signals.ageDays > signals.medianWonCycleDays * 2) {
    score -= 15;
    reasons.push(
      `deal age ${signals.ageDays}d vs typical won cycle ${signals.medianWonCycleDays}d`,
    );
  }

  score = Math.max(0, Math.min(100, score));
  const risk: DealRiskLevel =
    score >= 75 ? 'healthy' : score >= 55 ? 'watch' : score >= 35 ? 'at_risk' : 'critical';

  return {
    score,
    risk,
    reasons,
    recommendation: recommendationFor(risk, reasons),
  };
}

function recommendationFor(risk: DealRiskLevel, reasons: string[]): string {
  if (risk === 'healthy') {
    return 'Keep cadence; advance to next stage when criteria met.';
  }
  if (risk === 'watch') {
    return 'Schedule a check-in this week; confirm next step with champion.';
  }
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

// ─── Prospect scoring ──────────────────────────────────────────────────────

export interface ProspectSignals {
  /** Is the prospect's ICP profile strong? (industry, size, title match) */
  icpFit: number; // 0..100
  /** Recent engagement with marketing content (opens, clicks, visits). */
  engagementScore: number; // 0..100
  /** Did we detect intent signals (G2 searches, pricing page, comparison site). */
  intentScore: number; // 0..100
  /** Negative signal: recent "do not contact" / unsubscribe. */
  suppressed: boolean;
}

export type ProspectTier = 'hot' | 'warm' | 'cold' | 'skip';

export interface ProspectScore {
  score: number; // weighted 0..100
  tier: ProspectTier;
  recommendation: string;
}

/**
 * Weighted prospecting score. Weights favour ICP fit (40%) and intent (35%)
 * over raw engagement (25%). Suppressed contacts always return `skip`.
 */
export function scoreProspect(signals: ProspectSignals): ProspectScore {
  if (signals.suppressed) {
    return {
      score: 0,
      tier: 'skip',
      recommendation: 'Contact is suppressed — do not prospect.',
    };
  }
  const score = Math.round(
    signals.icpFit * 0.4 + signals.intentScore * 0.35 + signals.engagementScore * 0.25,
  );
  let tier: ProspectTier;
  let recommendation: string;
  if (score >= 75) {
    tier = 'hot';
    recommendation = 'Assign to a rep for personalised outreach this week.';
  } else if (score >= 50) {
    tier = 'warm';
    recommendation = 'Add to a nurture sequence + surface via marketing qualified lead trigger.';
  } else if (score >= 30) {
    tier = 'cold';
    recommendation = 'Keep in cold-list. Revisit after a content touch.';
  } else {
    tier = 'skip';
    recommendation = 'Not a fit — suppress from outbound.';
  }
  return { score, tier, recommendation };
}

// ─── Buyer intent surfacing ────────────────────────────────────────────────

export interface IntentEvent {
  /** Weight of the signal type (e.g. pricing page = 0.8, blog post = 0.2). */
  weight: number;
  ageInDays: number;
}

/**
 * Aggregate recent intent events with exponential decay. Half-life of 14
 * days means a visit from two weeks ago counts half as much.
 */
export function aggregateIntent(
  events: IntentEvent[],
  halfLifeDays = 14,
): { score: number; bucket: 'none' | 'low' | 'medium' | 'high' } {
  if (events.length === 0) return { score: 0, bucket: 'none' };
  let raw = 0;
  for (const e of events) {
    raw += e.weight * Math.pow(0.5, e.ageInDays / halfLifeDays);
  }
  const score = Math.min(100, Math.round(raw * 100));
  const bucket: 'none' | 'low' | 'medium' | 'high' =
    score === 0 ? 'none' : score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  return { score, bucket };
}

// ─── Content Agent (#331) ──────────────────────────────────────────────────
//
// Post-processing for the multi-format Content Agent. The service calls Claude,
// then delegates normalisation (slug/meta/word-count/read-time) here so it can
// be unit-tested without the API. Shape is format-agnostic: prose formats use
// `sections`, podcast scripts use `podcastSegments`.

export type ContentFormat = 'blog' | 'landing' | 'email' | 'podcast_script';

export interface ContentSection {
  heading: string;
  body: string;
}

export interface PodcastSegment {
  speaker: string;
  text: string;
}

/** Raw JSON as returned by Claude — fields may be missing/loose. */
export interface RawContent {
  title?: string;
  slug?: string;
  metaDescription?: string;
  sections?: ContentSection[];
  podcastSegments?: PodcastSegment[];
  callToAction?: string;
  keywords?: string[];
}

export interface ContentResult {
  format: ContentFormat;
  title: string;
  slug: string;
  metaDescription: string;
  sections: ContentSection[];
  podcastSegments: PodcastSegment[];
  callToAction: string;
  keywords: string[];
  wordCount: number;
  readingTimeMinutes: number;
}

/** Count words across markdown/plain fragments, ignoring formatting tokens. */
export function countWords(text: string): number {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#_*`>[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Normalise raw Claude output into a stable `ContentResult`: fill a slug from
 * the title when missing, derive a meta description from the body, and compute
 * word count + reading time from the actual content.
 */
export function finaliseContent(format: ContentFormat, raw: RawContent): ContentResult {
  const title = (raw.title ?? '').trim();
  const sections = (raw.sections ?? []).filter((s) => s && (s.heading || s.body));
  const podcastSegments = (raw.podcastSegments ?? []).filter((s) => s && s.text);

  const bodyJoined = [
    ...sections.map((s) => `${s.heading}\n${s.body}`),
    ...podcastSegments.map((s) => `${s.speaker}: ${s.text}`),
  ]
    .join('\n\n')
    .trim();

  const slugSource = raw.slug?.trim() || title;
  const metaDescription = raw.metaDescription?.trim() || extractExcerpt(bodyJoined, 155);

  return {
    format,
    title,
    slug: slugify(slugSource, 80),
    metaDescription,
    sections,
    podcastSegments,
    callToAction: (raw.callToAction ?? '').trim(),
    keywords: (raw.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    wordCount: countWords(bodyJoined),
    readingTimeMinutes: estimateReadTimeMinutes(bodyJoined),
  };
}
