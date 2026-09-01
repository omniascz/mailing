/**
 * Internal send-time-optimization endpoint — called by the daily-triggers cron.
 *
 * Separate from the authenticated /api/v1/send-optimization/* routes because
 * the worker has no user JWT; the internal-auth plugin guards this path.
 */

import type { FastifyPluginAsync } from 'fastify';
import { refreshStalePredictions } from '../../../services/send-optimization/refresh-predictions.js';

const internalSendOptimizationRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/send-optimization/refresh-predictions',
    { schema: { tags: ['Internal'], summary: 'Refresh stale per-contact STO predictions' } },
    async (_req, reply) => {
      const outcome = await refreshStalePredictions();
      return reply.send({ data: outcome });
    },
  );
};

export default internalSendOptimizationRoutes;
