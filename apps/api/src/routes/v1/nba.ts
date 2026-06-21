import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getNbaScore, upsertNbaScore, batchComputeNbaScores } from '../../services/ai/nba-engine.js';

export default async function nbaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  // GET /api/v1/nba/:contactId — get NBA score for a contact
  app.get('/api/v1/nba/:contactId', async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    let score = await getNbaScore(req.user!.orgId, contactId);
    if (!score) {
      await upsertNbaScore(req.user!.orgId, contactId);
      score = await getNbaScore(req.user!.orgId, contactId);
    }
    return reply.send({ data: score });
  });

  // POST /api/v1/nba/:contactId/recompute — force recompute
  app.post('/api/v1/nba/:contactId/recompute', async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    await upsertNbaScore(req.user!.orgId, contactId);
    const score = await getNbaScore(req.user!.orgId, contactId);
    return reply.send({ data: score });
  });

  // POST /api/v1/nba/batch-compute — compute for up to 200 contacts
  app.post('/api/v1/nba/batch-compute', async (req, reply) => {
    const { contactIds } = z.object({ contactIds: z.array(z.string().uuid()).min(1).max(200) }).parse(req.body);
    const computed = await batchComputeNbaScores(req.user!.orgId, contactIds);
    return reply.send({ data: { computed } });
  });
}
