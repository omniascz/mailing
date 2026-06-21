import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeAttribution, type AttributionModel } from '../../services/analytics/multi-touch-attribution.js';
import { predictRevenueImpact } from '../../services/analytics/revenue-impact.js';

export default async function attributionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/attribution/campaigns
   * Multi-touch attribution report — revenue credited to each campaign.
   */
  app.get('/api/v1/attribution/campaigns', async (req) => {
    const q = z
      .object({
        model: z.enum(['first_touch', 'last_touch', 'linear', 'time_decay', 'u_shaped']).default('u_shaped'),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
      })
      .parse(req.query);

    const results = await computeAttribution(req.user!.orgId, q.model as AttributionModel, {
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });

    return { data: results };
  });

  /**
   * POST /api/v1/attribution/pre-send-predict
   * Estimate revenue impact before sending a campaign.
   */
  app.post('/api/v1/attribution/pre-send-predict', async (req) => {
    const body = z
      .object({
        recipientCount: z.number().int().min(1),
        tags: z.array(z.string()).optional(),
        listId: z.string().uuid().optional(),
        lookbackDays: z.number().int().min(7).max(365).default(90),
      })
      .parse(req.body);

    const prediction = await predictRevenueImpact(req.user!.orgId, body);
    return { data: prediction };
  });
}
