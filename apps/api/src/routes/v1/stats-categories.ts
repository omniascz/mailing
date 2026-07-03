/**
 * Category & ISP stats routes (SendGrid parity).
 *
 *   GET /api/v1/stats/categories          — distinct category tags
 *   GET /api/v1/stats/categories/stats    — funnel counts per category
 *   GET /api/v1/stats/isps                — funnel counts per mailbox provider
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { categoryStats, ispStats, listCategories } from '../../services/stats/category-isp.js';

const rangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function parseRange(q: z.infer<typeof rangeQuery>) {
  return {
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  };
}

export default async function statsCategoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/stats/categories',
    { schema: { tags: ['Stats'], summary: 'List distinct send categories' } },
    async (req) => {
      const data = await listCategories(req.user!.orgId);
      return { data };
    },
  );

  app.get(
    '/api/v1/stats/categories/stats',
    { schema: { tags: ['Stats'], summary: 'Funnel counts grouped by category' } },
    async (req) => {
      const q = rangeQuery.parse(req.query);
      const data = await categoryStats(req.user!.orgId, parseRange(q));
      return { data };
    },
  );

  app.get(
    '/api/v1/stats/isps',
    { schema: { tags: ['Stats'], summary: 'Deliverability funnel grouped by ISP' } },
    async (req) => {
      const q = rangeQuery.parse(req.query);
      const data = await ispStats(req.user!.orgId, parseRange(q));
      return { data };
    },
  );
}
