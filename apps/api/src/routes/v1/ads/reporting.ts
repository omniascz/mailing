import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { syncAdPerformance, getAdPerformance, getAdPerformanceSummary } from '../../../services/ads/reporting.js';

const adReportingRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/ads/performance', auth, async (req, reply) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const data = await getAdPerformance(req.user!.orgId, q.days);
    return reply.send({ data });
  });

  app.get('/api/v1/ads/performance/summary', auth, async (req, reply) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const data = await getAdPerformanceSummary(req.user!.orgId, q.days);
    return reply.send({ data });
  });

  app.post('/api/v1/ads/performance/sync', auth, async (req, reply) => {
    const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body ?? {});
    const data = await syncAdPerformance(req.user!.orgId, body.date);
    return reply.send({ data });
  });
};

export default adReportingRoutes;
