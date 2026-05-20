import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  syncAccountAnalytics,
  getOrgAnalytics,
  getAccountAnalytics,
  getBestTimeToPost,
} from '../../../services/social/analytics.js';

const socialAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/social/analytics', auth, async (req, reply) => {
    const q = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(req.query);
    const data = await getOrgAnalytics(req.user!.orgId, q.days);
    return reply.send({ data });
  });

  app.get('/api/v1/social/analytics/:accountId', auth, async (req, reply) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(req.params);
    const q = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(req.query);
    const data = await getAccountAnalytics(req.user!.orgId, accountId, q.days);
    return reply.send({ data });
  });

  app.get('/api/v1/social/analytics/best-time', auth, async (req, reply) => {
    const data = await getBestTimeToPost(req.user!.orgId);
    return reply.send({ data });
  });

  app.post('/api/v1/social/analytics/sync', auth, async (req, reply) => {
    const data = await syncAccountAnalytics(req.user!.orgId);
    return reply.send({ data });
  });
};

export default socialAnalyticsRoutes;
