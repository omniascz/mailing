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
import { searchActivity } from '../../services/stats/activity-search.js';

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

  app.get(
    '/api/v1/activity',
    { schema: { tags: ['Stats'], summary: 'Search the email activity feed' } },
    async (req) => {
      const q = z
        .object({
          email: z.string().max(255).optional(),
          eventType: z
            .enum(['send', 'deliver', 'open', 'click', 'bounce', 'unsubscribe', 'complaint'])
            .optional(),
          messageId: z.string().max(255).optional(),
          campaignId: z.string().uuid().optional(),
          category: z.string().max(128).optional(),
          isp: z.string().max(32).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      const result = await searchActivity(req.user!.orgId, {
        ...q,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      });
      return { data: result.data, hasMore: result.hasMore, cursor: result.cursor };
    },
  );
}
