/**
 * Internal Channel Scoring refresh — called once per day by the daily-run
 * orchestrator alongside RFM + predictive segmentation.
 *
 * Sequential per-org for the same connection-pool reasons as RFM:
 * channel scoring touches up to five send-log tables per contact.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  refreshAllOrgsChannelScores,
  refreshOrgChannelScores,
} from '../../../services/channel-scoring/index.js';

const internalChannelScoringRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/channel-scoring/refresh-all',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh per-recipient channel scores for every org',
      },
    },
    async (_req, reply) => {
      const result = await refreshAllOrgsChannelScores();
      return reply.send({ data: result });
    },
  );

  app.post(
    '/api/v1/internal/channel-scoring/refresh',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh per-recipient channel scores for one org',
      },
    },
    async (req, reply) => {
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.body);
      const result = await refreshOrgChannelScores(orgId);
      return reply.send({ data: result });
    },
  );
};

export default internalChannelScoringRoutes;
