/**
 * AI Recommendations routes
 *
 *  POST /api/v1/ai/recommend — context-aware sidebar recommendations
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRecommendations } from '../../services/ai-recommendations/index.js';

const recommendBodySchema = z.object({
  currentPage: z.string().min(1),
  entityId: z.string().uuid().optional(),
  entityType: z.enum(['campaign', 'contact', 'segment', 'workflow']).optional(),
  entityData: z.record(z.unknown()).optional(),
  recentActions: z.array(z.string()).optional(),
});

export default async function aiRecommendationsRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/ai/recommend',
    {
      schema: { tags: ['AI'] },
    },
    async (request, reply) => {
      const { orgId } = request as unknown as { orgId: string };
      const body = recommendBodySchema.parse(request.body);
      const recommendations = await getRecommendations(orgId, body);
      return reply.send({ data: recommendations });
    },
  );
}
