/**
 * Deliverability insights routes (#353).
 *
 *   GET /api/v1/deliverability/insights?window=7  — list active insights (admin)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { computeInsights } from '../../services/deliverability/insights.js';

const deliverabilityInsightsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/deliverability/insights', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Deliverability'] },
  }, async (req, reply) => {
    const { window, ignore } = z.object({
      window: z.coerce.number().int().min(1).max(90).optional(),
      ignore: z.string().optional(),
    }).parse(req.query);
    const ignoredRules = ignore ? ignore.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return reply.send({
      data: await computeInsights({
        orgId: req.user!.orgId,
        windowDays: window,
        ignoredRules,
      }),
    });
  });
};

export default deliverabilityInsightsRoutes;
