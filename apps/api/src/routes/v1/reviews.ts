import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createReview, approveReview, rejectReview,
  listReviewsBySku, moderationQueue, reviewSummary,
} from '../../services/reviews/index.js';

const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/reviews', {
    preHandler: [app.authenticate],
    schema: { tags: ['Reviews'] },
  }, async (req, reply) => {
    const body = z.object({
      sku: z.string().min(1).max(128),
      rating: z.number().int().min(1).max(5),
      title: z.string().max(255).optional(),
      body: z.string().max(8000).optional(),
      authorName: z.string().max(255).optional(),
      contactId: z.string().uuid().optional(),
      photos: z.array(z.object({ url: z.string().url(), alt: z.string().optional() })).max(8).optional(),
      autoApprove: z.boolean().optional(),
    }).parse(req.body);
    return reply.code(201).send({ data: await createReview(req.user!.orgId, body) });
  });

  app.get('/api/v1/reviews/sku/:sku', {
    preHandler: [app.authenticate],
    schema: { tags: ['Reviews'] },
  }, async (req, reply) => {
    const { sku } = z.object({ sku: z.string() }).parse(req.params);
    const q = z.object({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      minRating: z.coerce.number().int().min(1).max(5).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }).parse(req.query);
    return reply.send({ data: await listReviewsBySku(req.user!.orgId, sku, q) });
  });

  app.get('/api/v1/reviews/sku/:sku/summary', {
    preHandler: [app.authenticate],
    schema: { tags: ['Reviews'] },
  }, async (req, reply) => {
    const { sku } = z.object({ sku: z.string() }).parse(req.params);
    return reply.send({ data: await reviewSummary(req.user!.orgId, sku) });
  });

  app.get('/api/v1/reviews/moderation', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Reviews'] },
  }, async (req, reply) => {
    return reply.send({ data: await moderationQueue(req.user!.orgId) });
  });

  app.post('/api/v1/reviews/:id/approve', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Reviews'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await approveReview(req.user!.orgId, id) });
  });

  app.post('/api/v1/reviews/:id/reject', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Reviews'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await rejectReview(req.user!.orgId, id) });
  });
};

export default reviewRoutes;
