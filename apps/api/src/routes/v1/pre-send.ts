import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generatePreSendTips } from '../../services/pre-send/index.js';

const preSendRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/pre-send/tips',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Pre-send'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          subject: z.string().min(1).max(500),
          preheader: z.string().max(500).optional(),
          htmlOrText: z.string().min(1).max(1_000_000),
          recipientCount: z.number().int().min(0),
          hasImages: z.boolean().optional(),
          hasLinks: z.boolean().optional(),
        })
        .parse(req.body);

      const tips = await generatePreSendTips(req.user!.orgId, body);
      return reply.send({ data: tips });
    },
  );
};

export default preSendRoutes;
