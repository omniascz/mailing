import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  syncAudienceToAdPlatform,
  listAudienceSyncs,
} from '../../../services/ads/audience-sync.js';

const adAudienceSyncRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };

  app.get('/api/v1/ads/audience-syncs', auth, async (req, reply) => {
    const q = z.object({ adAccountId: z.string().uuid().optional() }).parse(req.query);
    const data = await listAudienceSyncs(req.user!.orgId, q.adAccountId);
    return reply.send({ data });
  });

  app.post('/api/v1/ads/audience-syncs', auth, async (req, reply) => {
    const body = z
      .object({
        adAccountId: z.string().uuid(),
        audienceName: z.string().min(1).max(255),
        segmentId: z.string().uuid().optional(),
        listId: z.string().uuid().optional(),
        contactLimit: z.number().int().positive().max(10_000_000).optional(),
      })
      .parse(req.body);
    const data = await syncAudienceToAdPlatform(req.user!.orgId, body);
    return reply.send({ data });
  });
};

export default adAudienceSyncRoutes;
