/**
 * Reviews v2 orchestrator (§9 P1).
 *
 * Builds on the legacy services/reviews module (productReviews table)
 * with a full moderation lifecycle + sentiment analysis + per-order
 * request tokens. Both modules coexist — pick this one for the §9 P1
 * launch workflow (post-delivery review request with token-based
 * public submit).
 *
 * Public submit path authenticates with a `review_requests.token`
 * issued by a workflow's `send_review_request` action. Once submitted,
 * `suggestInitialStatus` auto-flags obvious spam; otherwise the row
 * lands in `pending` for human moderation.
 *
 * Sentiment is best-effort: when Claude returns a parseable verdict
 * we persist it; on failure we fall back to a rating-derived band so
 * the dashboard always shows something.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  reviews,
  reviewRequests,
  type NewReview,
  type Review,
  type ReviewRequest,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  bandFromScore,
  detectSpam,
  fallbackSentimentFromRating,
  generateReviewToken,
  summariseRatings,
  suggestInitialStatus,
  type ReviewStatus,
} from './pure.js';

const SENTIMENT_PROMPT = `You analyse short product reviews and return their overall sentiment.
Respond with strict JSON: {"sentiment": "positive"|"neutral"|"negative", "score": -1..1}.
"score" is a float from -1 (very negative) to +1 (very positive).
Reply with JSON only, nothing else.`;

// ─── Review CRUD ─────────────────────────────────────────────────────────

export interface SubmitReviewInput {
  rating: number;
  title?: string;
  body: string;
  productSku?: string;
  productName?: string;
  contactId?: string;
  orderId?: string;
  source?: string;
}

export async function submitReview(orgId: string, input: SubmitReviewInput): Promise<Review> {
  if (input.rating < 1 || input.rating > 5 || !Number.isFinite(input.rating)) {
    throw AppError.badRequest('Rating must be 1..5');
  }
  if (!input.body || input.body.trim().length === 0) {
    throw AppError.badRequest('Body is required');
  }

  const spam = detectSpam(input.body, input.title);
  const initialStatus = suggestInitialStatus({ spam, rating: input.rating });

  // Best-effort sentiment via Claude. Falls back to rating mapping on error.
  let sentiment: 'positive' | 'neutral' | 'negative';
  let sentimentScore: number;
  try {
    const { callClaude, parseJsonSafe } = await import('../../lib/ai-client.js');
    const out = await callClaude({
      tenantId: orgId,
      feature: 'other',
      system: SENTIMENT_PROMPT,
      user: `Rating: ${input.rating}/5\nTitle: ${input.title ?? ''}\nReview: ${input.body}`,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 80,
    });
    const parsed = parseJsonSafe<{ sentiment?: string; score?: number }>(out.text);
    const score =
      typeof parsed.score === 'number' && Number.isFinite(parsed.score)
        ? Math.max(-1, Math.min(1, parsed.score))
        : null;
    if (score === null) throw new Error('no score');
    sentiment = bandFromScore(score);
    sentimentScore = score;
  } catch {
    const fb = fallbackSentimentFromRating(input.rating);
    sentiment = fb.sentiment;
    sentimentScore = fb.score;
  }

  const values: NewReview = {
    orgId,
    contactId: input.contactId,
    productSku: input.productSku,
    productName: input.productName,
    orderId: input.orderId,
    rating: input.rating,
    title: input.title,
    body: input.body.trim(),
    status: initialStatus,
    sentiment,
    sentimentScore: sentimentScore.toFixed(3),
    source: input.source ?? 'public_form',
    moderationReason: spam.likelySpam ? `auto_spam:${spam.reasons.join(',')}` : null,
  };

  const [row] = await db.insert(reviews).values(values).returning();
  if (!row) throw AppError.internal('Failed to insert review');
  return row;
}

export interface ListReviewsOpts {
  status?: ReviewStatus;
  productSku?: string;
  limit?: number;
}

export async function listReviewsV2(orgId: string, opts: ListReviewsOpts = {}) {
  const conds = [eq(reviews.orgId, orgId), isNull(reviews.deletedAt)];
  if (opts.status) conds.push(eq(reviews.status, opts.status));
  if (opts.productSku) conds.push(eq(reviews.productSku, opts.productSku));
  return db
    .select()
    .from(reviews)
    .where(and(...conds))
    .orderBy(desc(reviews.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 500));
}

export async function getReviewV2(orgId: string, id: string): Promise<Review> {
  const [row] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, id), eq(reviews.orgId, orgId), isNull(reviews.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('Review');
  return row;
}

export interface ModerationInput {
  status: 'approved' | 'rejected' | 'spam';
  reason?: string;
  moderatedByUserId?: string;
}

export async function moderateReviewV2(
  orgId: string,
  id: string,
  input: ModerationInput,
): Promise<Review> {
  const now = new Date();
  const [row] = await db
    .update(reviews)
    .set({
      status: input.status,
      moderationReason: input.reason,
      moderatedByUserId: input.moderatedByUserId,
      moderatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(reviews.id, id), eq(reviews.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Review');
  return row;
}

export async function deleteReviewV2(orgId: string, id: string): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(reviews)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(reviews.id, id), eq(reviews.orgId, orgId)))
    .returning({ id: reviews.id });
  if (!row) throw AppError.notFound('Review');
}

// ─── Per-product / org summaries ─────────────────────────────────────────

export async function getProductRatingSummary(orgId: string, productSku: string) {
  const rows = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(
      and(
        eq(reviews.orgId, orgId),
        eq(reviews.productSku, productSku),
        eq(reviews.status, 'approved'),
        isNull(reviews.deletedAt),
      ),
    );
  return summariseRatings(rows.map((r) => r.rating));
}

export async function getOrgRatingSummary(orgId: string) {
  const rows = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(
      and(eq(reviews.orgId, orgId), eq(reviews.status, 'approved'), isNull(reviews.deletedAt)),
    );
  return summariseRatings(rows.map((r) => r.rating));
}

// ─── Review request tokens ──────────────────────────────────────────────

export async function createReviewRequest(opts: {
  orgId: string;
  contactId?: string;
  orderId?: string;
  productSku?: string;
}): Promise<ReviewRequest> {
  const [row] = await db
    .insert(reviewRequests)
    .values({
      orgId: opts.orgId,
      contactId: opts.contactId,
      orderId: opts.orderId,
      productSku: opts.productSku,
      token: generateReviewToken(),
    })
    .returning();
  if (!row) throw AppError.internal('Failed to issue review request');
  return row;
}

export async function getReviewRequest(token: string): Promise<ReviewRequest | null> {
  const [row] = await db
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.token, token))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function markRequestResponded(token: string, reviewId: string): Promise<void> {
  await db
    .update(reviewRequests)
    .set({ reviewId, respondedAt: new Date() })
    .where(eq(reviewRequests.token, token));
}
