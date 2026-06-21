import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCurrencyRevenue, getCurrencyRevenueByMonth } from '../../services/analytics/currency-revenue.js';

export default async function currencyAnalyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /** GET /api/v1/analytics/currency-revenue */
  app.get('/api/v1/analytics/currency-revenue', async (req) => {
    const q = z.object({
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }).parse(req.query);

    const dateTo   = q.dateTo   ? new Date(q.dateTo)   : new Date();
    const dateFrom = q.dateFrom ? new Date(q.dateFrom) : new Date(Date.now() - 30 * 86400_000);

    const report = await getCurrencyRevenue(req.user!.orgId, dateFrom, dateTo);
    return { data: report };
  });

  /** GET /api/v1/analytics/currency-revenue/monthly */
  app.get('/api/v1/analytics/currency-revenue/monthly', async (req) => {
    const q = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }).parse(req.query);
    const rows = await getCurrencyRevenueByMonth(req.user!.orgId, q.months);
    return { data: rows };
  });
}
