import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generatePreSendTips } from '../../services/pre-send/index.js';
import { runPreSendChecks } from '../../services/pre-send/go-no-go.js';

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

  /**
   * Pre-send Go/No-Go panel — aggregates 12 checks into a single verdict.
   * The campaign-send action gates on `verdict !== 'no-go'` (or warn user
   * + require override on 'caution'). UI surfaces the prioritised checks
   * with fix CTAs.
   */
  app.get(
    '/api/v1/campaigns/:id/pre-send-checks',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Pre-send'],
        summary: 'Run pre-send Go/No-Go checks for a campaign',
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const report = await runPreSendChecks(req.user!.orgId, id);
      return reply.send({ data: report });
    },
  );
};

export default preSendRoutes;
