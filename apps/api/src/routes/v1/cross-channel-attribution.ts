import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeCrossChannelAttribution } from '../../services/analytics/cross-channel-attribution.js';

export default async function crossChannelAttributionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/analytics/cross-channel
   * Cross-channel attribution: which channel gets credit for conversions.
   */
  app.get('/api/v1/analytics/cross-channel', async (req) => {
    const q = z.object({
      model: z.enum(['last_touch', 'first_touch', 'linear', 'email_boost']).default('email_boost'),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }).parse(req.query);

    const dateTo   = q.dateTo   ? new Date(q.dateTo)   : new Date();
    const dateFrom = q.dateFrom ? new Date(q.dateFrom) : new Date(Date.now() - 30 * 86400_000);

    const report = await computeCrossChannelAttribution(req.user!.orgId, q.model, dateFrom, dateTo);
    return { data: report };
  });
}
