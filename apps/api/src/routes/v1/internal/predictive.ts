/**
 * Internal predictive refresh — called daily by the trigger orchestrator.
 * Same pattern as internal/rfm.ts: one all-orgs sweep, optional single-org
 * fallback for tenants that need an earlier refresh.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  refreshAllOrgsPredictions,
  refreshOrgPredictions,
} from '../../../services/predictive-segmentation/index.js';

const internalPredictiveRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/predictive/refresh-all',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh predictive scores for every org (daily cron)',
      },
    },
    async (_req, reply) => {
      return reply.send({ data: await refreshAllOrgsPredictions() });
    },
  );

  app.post(
    '/api/v1/internal/predictive/refresh',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh predictive scores for a single org',
      },
    },
    async (req, reply) => {
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.body);
      return reply.send({ data: await refreshOrgPredictions(orgId) });
    },
  );
};

export default internalPredictiveRoutes;
