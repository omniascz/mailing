/**
 * Internal Engagement Score refresh — called daily by the orchestrator
 * alongside RFM / predictive / channel scoring.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  refreshAllOrgsEngagement,
  refreshOrgEngagement,
} from '../../../services/engagement-score/index.js';

const internalEngagementScoreRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/engagement-score/refresh-all',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh engagement scores for every org',
      },
    },
    async (_req, reply) => {
      const result = await refreshAllOrgsEngagement();
      return reply.send({ data: result });
    },
  );

  app.post(
    '/api/v1/internal/engagement-score/refresh',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh engagement scores for one org',
      },
    },
    async (req, reply) => {
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.body);
      const result = await refreshOrgEngagement(orgId);
      return reply.send({ data: result });
    },
  );
};

export default internalEngagementScoreRoutes;
