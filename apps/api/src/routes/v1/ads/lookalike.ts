import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLookalikeAudience } from '../../../services/ads/lookalike.js';

const adLookalikeRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/ads/lookalike',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Ads'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          adAccountId: z.string().uuid(),
          sourceSyncId: z.string().uuid(),
          lookalikeName: z.string().max(255).optional(),
          countryCode: z.string().length(2).default('US'),
          ratio: z.number().min(0.01).max(0.2).default(0.02),
        })
        .parse(req.body);
      const data = await createLookalikeAudience(req.user!.orgId, body);
      return reply.code(201).send({ data });
    },
  );
};

export default adLookalikeRoutes;
