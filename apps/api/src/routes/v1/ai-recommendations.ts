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

/**
 * Same defect as routes/v1/ai-agents.ts: no `preHandler`, and the org read off
 * `request.orgId`, which no plugin sets. Unlike the ai-agents list routes this
 * one did not fail on the undefined — `getRecommendations` passes the org to
 * the Claude client as a cache/quota key, so an anonymous caller reached the
 * paid API and every such call shared one bucket keyed on `undefined`.
 *
 * The dashboard sidebar is the only intended caller and it is a logged-in
 * surface, so `app.authenticate` (session or secret key), not
 * `authenticatePublic` — a publishable key embedded in a page must not be able
 * to spend an org's AI quota.
 */
export default async function aiRecommendationsRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/ai/recommend',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['AI'] },
    },
    async (request, reply) => {
      const { orgId } = request.user!;
      const body = recommendBodySchema.parse(request.body);
      const recommendations = await getRecommendations(orgId, body);
      return reply.send({ data: recommendations });
    },
  );
}
