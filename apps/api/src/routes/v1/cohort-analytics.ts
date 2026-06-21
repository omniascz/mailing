/**
 * Cohort & funnel analytics routes (#449).
 *
 *   GET  /api/v1/analytics/cohort         — contact retention cohort matrix
 *   POST /api/v1/analytics/funnel         — multi-step funnel conversion
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeCohortRetention, computeFunnel } from '../../services/analytics/cohort.js';

export default async function cohortAnalyticsRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/analytics/cohort',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Analytics'], summary: 'Contact retention cohort matrix' },
    },
    async (req, reply) => {
      const query = z
        .object({
          interval: z.enum(['week', 'month']).default('month'),
          periods: z.coerce.number().int().min(1).max(24).default(6),
          startDate: z.string().datetime().optional(),
        })
        .parse(req.query);

      const report = await computeCohortRetention(req.user!.orgId, {
        interval: query.interval,
        periods: query.periods,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
      });
      return reply.send({ data: report });
    },
  );

  const funnelStepSchema = z.object({
    name: z.string().min(1).max(255),
    eventType: z.string().min(1).max(80),
    entityId: z.string().uuid().optional(),
  });

  app.post(
    '/api/v1/analytics/funnel',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Analytics'], summary: 'Multi-step funnel conversion analysis' },
    },
    async (req, reply) => {
      const body = z
        .object({
          steps: z.array(funnelStepSchema).min(2).max(10),
          windowDays: z.number().int().min(1).max(365).default(30),
        })
        .parse(req.body);

      const report = await computeFunnel(req.user!.orgId, body.steps, body.windowDays);
      return reply.send({ data: report });
    },
  );
}
