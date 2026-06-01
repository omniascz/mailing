/**
 * Reviews v2 routes (§9 P1).
 *
 * Distinct from the legacy `routes/v1/reviews.ts` so both APIs can run
 * side-by-side during the migration period. The v2 surface adds a
 * public token-based submit + moderation lifecycle + sentiment.
 *
 * Public (no auth):
 *   POST /reviews-v2/submit/:token   submit via request token
 *   GET  /reviews-v2/request/:token  fetch prefilled request context
 *
 * Auth-gated:
 *   GET    /api/v1/reviews-v2                    list with filters
 *   GET    /api/v1/reviews-v2/:id                retrieve
 *   PATCH  /api/v1/reviews-v2/:id/moderate       set status + reason
 *   DELETE /api/v1/reviews-v2/:id                soft-delete
 *   GET    /api/v1/reviews-v2/summary/:sku       per-product rating summary
 *   GET    /api/v1/reviews-v2/summary            org-wide summary
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  deleteReviewV2,
  getOrgRatingSummary,
  getProductRatingSummary,
  getReviewV2,
  getReviewRequest,
  listReviewsV2,
  markRequestResponded,
  moderateReviewV2,
  submitReview,
} from '../../services/reviews-v2/index.js';

const reviewsV2Routes: FastifyPluginAsync = async (app) => {
  app.get(
    '/reviews-v2/request/:token',
    {
      schema: {
        tags: ['Reviews', 'Public'],
        summary: 'Return the prefilled review request context (no auth)',
      },
    },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(128) }).parse(req.params);
      const r = await getReviewRequest(token);
      if (!r) return reply.code(404).send({ error: 'review_request_not_found' });
      return reply.send({
        data: {
          token: r.token,
          orderId: r.orderId,
          productSku: r.productSku,
          orgId: r.orgId,
          expiresAt: r.expiresAt.toISOString(),
        },
      });
    },
  );

  app.post(
    '/reviews-v2/submit/:token',
    {
      schema: {
        tags: ['Reviews', 'Public'],
        summary: 'Submit a review using a per-order request token (no auth)',
      },
    },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10).max(128) }).parse(req.params);
      const r = await getReviewRequest(token);
      if (!r) return reply.code(404).send({ error: 'review_request_not_found' });

      const body = z
        .object({
          rating: z.number().int().min(1).max(5),
          title: z.string().max(255).optional(),
          body: z.string().min(2).max(4000),
        })
        .parse(req.body);

      const review = await submitReview(r.orgId, {
        rating: body.rating,
        title: body.title,
        body: body.body,
        productSku: r.productSku ?? undefined,
        orderId: r.orderId ?? undefined,
        contactId: r.contactId ?? undefined,
        source: 'public_form',
      });
      await markRequestResponded(token, review.id);
      return reply.code(201).send({
        data: { id: review.id, status: review.status, sentiment: review.sentiment },
      });
    },
  );

  app.get(
    '/api/v1/reviews-v2',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Reviews'], summary: 'List reviews v2' },
    },
    async (req, reply) => {
      const q = z
        .object({
          status: z.enum(['pending', 'approved', 'rejected', 'spam']).optional(),
          productSku: z.string().max(128).optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query);
      const rows = await listReviewsV2(req.user!.orgId, q);
      return reply.send({ data: rows });
    },
  );

  app.get(
    '/api/v1/reviews-v2/summary',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Reviews'], summary: 'Org-wide rating summary' },
    },
    async (req, reply) => {
      const data = await getOrgRatingSummary(req.user!.orgId);
      return reply.send({ data });
    },
  );

  app.get(
    '/api/v1/reviews-v2/summary/:sku',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Reviews'], summary: 'Per-product rating summary' },
    },
    async (req, reply) => {
      const { sku } = z.object({ sku: z.string().max(128) }).parse(req.params);
      const data = await getProductRatingSummary(req.user!.orgId, sku);
      return reply.send({ data });
    },
  );

  app.get(
    '/api/v1/reviews-v2/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Reviews'], summary: 'Retrieve a single review' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const r = await getReviewV2(req.user!.orgId, id);
      return reply.send({ data: r });
    },
  );

  app.patch(
    '/api/v1/reviews-v2/:id/moderate',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Reviews'], summary: 'Approve / reject / flag as spam' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          status: z.enum(['approved', 'rejected', 'spam']),
          reason: z.string().max(255).optional(),
        })
        .parse(req.body);
      const r = await moderateReviewV2(req.user!.orgId, id, {
        status: body.status,
        reason: body.reason,
        moderatedByUserId: req.user!.userId,
      });
      return reply.send({ data: r });
    },
  );

  app.delete(
    '/api/v1/reviews-v2/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Reviews'], summary: 'Soft-delete a review' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteReviewV2(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );
};

export default reviewsV2Routes;
