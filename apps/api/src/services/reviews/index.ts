/**
 * Product Reviews — Klaviyo-style native review system.
 * Captures rating + body + photos, supports moderation queue, exposes
 * aggregate ratings per SKU for embedding in product pages and emails.
 */

import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { productReviews, type ProductReview } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface CreateReviewInput {
  sku: string;
  rating: number;
  title?: string;
  body?: string;
  authorName?: string;
  contactId?: string;
  photos?: Array<{ url: string; alt?: string }>;
  autoApprove?: boolean;
}

export async function createReview(
  orgId: string,
  input: CreateReviewInput,
): Promise<ProductReview> {
  if (input.rating < 1 || input.rating > 5) {
    throw AppError.badRequest('Rating must be 1–5');
  }
  const [row] = await db
    .insert(productReviews)
    .values({
      orgId,
      sku: input.sku,
      contactId: input.contactId ?? null,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body ?? null,
      authorName: input.authorName ?? null,
      photos: input.photos ?? [],
      status: input.autoApprove ? 'approved' : 'pending',
      approvedAt: input.autoApprove ? new Date() : null,
    })
    .returning();
  return row!;
}

export async function approveReview(orgId: string, reviewId: string): Promise<ProductReview> {
  const [row] = await db
    .update(productReviews)
    .set({ status: 'approved', approvedAt: new Date() })
    .where(and(eq(productReviews.id, reviewId), eq(productReviews.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Review');
  return row;
}

export async function rejectReview(orgId: string, reviewId: string): Promise<ProductReview> {
  const [row] = await db
    .update(productReviews)
    .set({ status: 'rejected' })
    .where(and(eq(productReviews.id, reviewId), eq(productReviews.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Review');
  return row;
}

export async function listReviewsBySku(
  orgId: string,
  sku: string,
  opts?: {
    status?: 'pending' | 'approved' | 'rejected';
    minRating?: number;
    limit?: number;
  },
): Promise<ProductReview[]> {
  const conds = [eq(productReviews.orgId, orgId), eq(productReviews.sku, sku)];
  if (opts?.status) conds.push(eq(productReviews.status, opts.status));
  if (opts?.minRating) conds.push(gte(productReviews.rating, opts.minRating));
  return db
    .select()
    .from(productReviews)
    .where(and(...conds))
    .orderBy(desc(productReviews.createdAt))
    .limit(opts?.limit ?? 50);
}

export async function moderationQueue(orgId: string, limit = 50): Promise<ProductReview[]> {
  return db
    .select()
    .from(productReviews)
    .where(and(eq(productReviews.orgId, orgId), eq(productReviews.status, 'pending')))
    .orderBy(asc(productReviews.createdAt))
    .limit(limit);
}

export interface ReviewSummary {
  sku: string;
  total: number;
  average: number;
  histogram: Record<1 | 2 | 3 | 4 | 5, number>;
}

export async function reviewSummary(orgId: string, sku: string): Promise<ReviewSummary> {
  const rs = await db.execute<{ rating: number; count: string }>(sql`
    SELECT rating, COUNT(*)::text AS count FROM product_reviews
    WHERE org_id = ${orgId}::uuid AND sku = ${sku} AND status = 'approved'
    GROUP BY rating
  `);
  const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let total = 0;
  let weightedSum = 0;
  for (const r of rs as unknown as Array<{ rating: number; count: string }>) {
    const c = Number(r.count);
    histogram[r.rating as 1 | 2 | 3 | 4 | 5] = c;
    total += c;
    weightedSum += r.rating * c;
  }
  return {
    sku,
    total,
    average: total > 0 ? Math.round((weightedSum / total) * 10) / 10 : 0,
    histogram,
  };
}
