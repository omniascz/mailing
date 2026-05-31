/**
 * AI quota status endpoint.
 *
 * Dashboard banner ("you've used 78% of today's AI quota") and the
 * pre-flight check on AI feature pages call this. The enforcement
 * itself is wired into shared-ai's rateLimiter so over-quota requests
 * never reach Claude.
 */

import type { FastifyPluginAsync } from 'fastify';
import { getAiQuotaStatus } from '../../services/billing/plan-enforcement.js';

const aiQuotaRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/ai/quota',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['AI'],
        summary: 'Current daily AI generation usage and limit for the org',
      },
    },
    async (req, reply) => {
      const status = await getAiQuotaStatus(req.user!.orgId);
      // -1 from getAiQuotaPerDay is Enterprise (unlimited); surface as null
      // so the UI renders "Unlimited" instead of a giant number.
      const limitForJson = Number.isFinite(status.limitPerDay) ? status.limitPerDay : null;
      const remainingForJson = Number.isFinite(status.remaining) ? status.remaining : null;
      return reply.send({
        data: {
          plan: status.plan,
          limitPerDay: limitForJson,
          used24h: status.used24h,
          remaining: remainingForJson,
          pctUsed: Math.round(status.pctUsed * 10) / 10,
        },
      });
    },
  );
};

export default aiQuotaRoutes;
