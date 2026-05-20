import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { trackPurchase, campaignRevenueReport } from '../../services/revenue-attribution/index.js';

const revenueRoutes: FastifyPluginAsync = async (app) => {
  // Public tracking endpoint — meant to be called from the storefront.
  // Auth is via API key header (X-API-Key) handled by the auth plugin.
  app.post(
    '/api/v1/revenue/track',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Revenue'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          contactId: z.string().uuid().optional(),
          orderId: z.string().max(128).optional(),
          amount: z.number().nonnegative(),
          currency: z.string().length(3).default('USD'),
          items: z
            .array(
              z.object({
                sku: z.string(),
                name: z.string(),
                qty: z.number(),
                price: z.number(),
              }),
            )
            .optional(),
          utm: z
            .object({
              source: z.string().optional(),
              medium: z.string().optional(),
              campaign: z.string().optional(),
            })
            .optional(),
          occurredAt: z.string().datetime().optional(),
          attributionModel: z.enum(['last_touch', 'first_touch', 'linear']).optional(),
          conversionWindowDays: z.number().int().min(1).max(365).optional(),
        })
        .parse(req.body);

      const event = await trackPurchase({
        ...body,
        orgId: req.user!.orgId,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      });
      return reply.code(201).send({ data: event });
    },
  );

  app.get(
    '/api/v1/revenue/report',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Revenue'] },
    },
    async (req, reply) => {
      const q = z.object({ since: z.string().datetime().optional() }).parse(req.query);
      return reply.send({
        data: await campaignRevenueReport(req.user!.orgId, {
          since: q.since ? new Date(q.since) : undefined,
        }),
      });
    },
  );
};

export default revenueRoutes;
