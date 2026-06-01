/**
 * Reviews pure helpers (§9 P1).
 *
 * Stateless logic so it stays unit-testable. The orchestrator in
 * `index.ts` wires DB + Claude calls; this file owns the math and the
 * heuristics.
 */

import { randomBytes } from 'node:crypto';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'spam';

/** Distribution of 1–5 star buckets. */
export interface RatingDistribution {
  one: number;
  two: number;
  three: number;
  four: number;
  five: number;
}

export interface RatingSummary {
  count: number;
  average: number; // 0..5, two decimal places
  distribution: RatingDistribution;
}

export function summariseRatings(ratings: readonly number[]): RatingSummary {
  const dist: RatingDistribution = { one: 0, two: 0, three: 0, four: 0, five: 0 };
  let sum = 0;
  let count = 0;
  for (const raw of ratings) {
    const r = Math.round(raw);
    if (r < 1 || r > 5) continue;
    sum += r;
    count++;
    if (r === 1) dist.one++;
    else if (r === 2) dist.two++;
    else if (r === 3) dist.three++;
    else if (r === 4) dist.four++;
    else dist.five++;
  }
  const average = count === 0 ? 0 : Math.round((sum / count) * 100) / 100;
  return { count, average, distribution: dist };
}

// ─── Spam detection ──────────────────────────────────────────────────────

const SPAM_KEYWORDS = [
  'click here',
  'buy cheap',
  'free viagra',
  'viagra',
  'lottery',
  'crypto signal',
  'forex bonus',
  'casino bonus',
  'http://bit.ly',
  'https://bit.ly',
  'whatsapp +',
  'whats app +',
  'visit my profile',
];

/**
 * Heuristic spam check — returns a score 0..100 (higher = spammier) and
 * a short rationale. We use this as a fast pre-filter; sentiment from
 * Claude is the deeper signal.
 */
export interface SpamCheck {
  score: number;
  reasons: string[];
  likelySpam: boolean; // score >= 60
}

export function detectSpam(body: string, title?: string): SpamCheck {
  const reasons: string[] = [];
  const text = `${title ?? ''} ${body}`.toLowerCase();
  let score = 0;

  for (const kw of SPAM_KEYWORDS) {
    if (text.includes(kw)) {
      reasons.push(`keyword:${kw}`);
      score += 30;
    }
  }

  // URL count
  const urls = (text.match(/https?:\/\/\S+/g) ?? []).length;
  if (urls >= 3) {
    reasons.push('many_urls');
    score += 20;
  } else if (urls === 0) {
    // not spammy by itself
  }

  // All-caps title
  if (title && title.length > 5 && title === title.toUpperCase()) {
    reasons.push('all_caps_title');
    score += 15;
  }

  // Excessive emoji / unicode noise (cheap heuristic — count emoji-range chars)
  const emojiMatches = body.match(/\p{Extended_Pictographic}/gu);
  if (emojiMatches && emojiMatches.length >= 5) {
    reasons.push('emoji_spam');
    score += 10;
  }

  // Very short reviews are usually low-signal but not spam — don't bump.

  score = Math.min(100, score);
  return { score, reasons, likelySpam: score >= 60 };
}

// ─── Sentiment helpers ───────────────────────────────────────────────────

/** Map a -1..+1 sentiment score to a coarse band. */
export function bandFromScore(score: number): 'positive' | 'neutral' | 'negative' {
  if (score >= 0.25) return 'positive';
  if (score <= -0.25) return 'negative';
  return 'neutral';
}

/** Map rating to a coarse sentiment when no model is available. */
export function fallbackSentimentFromRating(
  rating: number,
): { sentiment: 'positive' | 'neutral' | 'negative'; score: number } {
  if (rating >= 4) return { sentiment: 'positive', score: 0.6 };
  if (rating === 3) return { sentiment: 'neutral', score: 0 };
  return { sentiment: 'negative', score: -0.6 };
}

// ─── Tokens ──────────────────────────────────────────────────────────────

/** URL-safe random token for a review request. */
export function generateReviewToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Auto-derive an initial moderation status from spam + rating signals. */
export function suggestInitialStatus(opts: {
  spam: SpamCheck;
  rating: number;
}): ReviewStatus {
  if (opts.spam.likelySpam) return 'spam';
  return 'pending';
}
