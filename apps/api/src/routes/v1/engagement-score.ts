/**
 * Engagement Score read endpoints (§9 P1).
 *
 *   GET /api/v1/contacts/:id/engagement-score   per-contact lookup
 *   GET /api/v1/engagement-score/distribution   org-level band counts
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  engagementBandDistribution,
  getContactEngagementScore,
} from '../../services/engagement-score/index.js';

const engagementScoreRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/contacts/:id/engagement-score',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['EngagementScore'],
        summary: 'Get cached engagement score for a contact',
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const result = await getContactEngagementScore(req.user!.orgId, id);
      if (!result || result.score === null) {
        return reply.code(404).send({ error: 'No engagement score computed yet' });
      }
      return reply.send({ data: result });
    },
  );

  app.get(
    '/api/v1/engagement-score/distribution',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['EngagementScore'],
        summary: 'Org-wide engagement band distribution',
      },
    },
    async (req, reply) => {
      const data = await engagementBandDistribution(req.user!.orgId);
      return reply.send({ data });
    },
  );
};

export default engagementScoreRoutes;
