import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signupCohorts } from '../../services/cohort/index.js';
import { computeFunnel } from '../../services/funnel/index.js';
import { bestSellers, slowMovers, revenueByCategory } from '../../services/catalog-insights/index.js';
import { getTimeline } from '../../services/timeline/index.js';

const advancedAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/analytics/cohorts', {
    preHandler: [app.authenticate],
    schema: { tags: ['Analytics'] },
  }, async (req, reply) => {
    const q = z.object({
      period: z.enum(['week', 'month']).optional(),
      periods: z.coerce.number().int().min(1).max(24).optional(),
    }).parse(req.query);
    return reply.send({ data: await signupCohorts(req.user!.orgId, q) });
  });

  app.post('/api/v1/analytics/funnel', {
    preHandler: [app.authenticate],
    schema: { tags: ['Analytics'] },
  }, async (req, reply) => {
    const body = z.object({
      events: z.array(z.string().min(1)).min(2).max(8),
      windowDays: z.number().int().min(1).max(365).optional(),
      since: z.coerce.date().optional(),
    }).parse(req.body);
    return reply.send({ data: await computeFunnel(req.user!.orgId, body) });
  });

  app.get('/api/v1/analytics/best-sellers', {
    preHandler: [app.authenticate],
    schema: { tags: ['Analytics'] },
  }, async (req, reply) => {
    const q = z.object({
      days: z.coerce.number().int().min(1).max(365).default(30),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);
    return reply.send({ data: await bestSellers(req.user!.orgId, q.days, q.limit) });
  });

  app.get('/api/v1/analytics/slow-movers', {
    preHandler: [app.authenticate],
    schema: { tags: ['Analytics'] },
  }, async (req, reply) => {
    const q = z.object({
      days: z.coerce.number().int().min(1).max(365).default(90),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);
    return reply.send({ data: await slowMovers(req.user!.orgId, q.days, q.limit) });
  });

  app.get('/api/v1/analytics/category-revenue', {
    preHandler: [app.authenticate],
    schema: { tags: ['Analytics'] },
  }, async (req, reply) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    return reply.send({ data: await revenueByCategory(req.user!.orgId, q.days) });
  });

  app.get('/api/v1/contacts/:contactId/timeline', {
    preHandler: [app.authenticate],
    schema: { tags: ['Analytics'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).optional(),
      before: z.coerce.date().optional(),
    }).parse(req.query);
    return reply.send({ data: await getTimeline(req.user!.orgId, contactId, q) });
  });
};

export default advancedAnalyticsRoutes;
