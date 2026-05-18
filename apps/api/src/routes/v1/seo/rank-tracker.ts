import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  addTrackedKeyword, removeTrackedKeyword, listTrackedKeywords,
  fetchRankSnapshot, getRankHistory,
} from '../../../services/seo/rank-tracker.js';

const seoRankTrackerRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/seo/rank-tracker', auth, async (req, reply) => {
    const data = await listTrackedKeywords(req.user!.orgId);
    return reply.send({ data });
  });

  app.post('/api/v1/seo/rank-tracker', auth, async (req, reply) => {
    const body = z.object({
      keyword: z.string().min(1).max(500),
      url: z.string().url(),
      language: z.string().max(8).default('en'),
      country: z.string().max(4).default('US'),
    }).parse(req.body);
    const data = await addTrackedKeyword(req.user!.orgId, body);
    return reply.code(201).send({ data });
  });

  app.delete('/api/v1/seo/rank-tracker/:trackingId', auth, async (req, reply) => {
    const { trackingId } = z.object({ trackingId: z.string().uuid() }).parse(req.params);
    await removeTrackedKeyword(req.user!.orgId, trackingId);
    return reply.code(204).send();
  });

  app.post('/api/v1/seo/rank-tracker/:trackingId/refresh', auth, async (req, reply) => {
    const { trackingId } = z.object({ trackingId: z.string().uuid() }).parse(req.params);
    const data = await fetchRankSnapshot(trackingId);
    return reply.send({ data });
  });

  app.get('/api/v1/seo/rank-tracker/:trackingId/history', auth, async (req, reply) => {
    const { trackingId } = z.object({ trackingId: z.string().uuid() }).parse(req.params);
    const q = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).parse(req.query);
    const data = await getRankHistory(req.user!.orgId, trackingId, q.days);
    return reply.send({ data });
  });
};

export default seoRankTrackerRoutes;
