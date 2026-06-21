/**
 * Internal blacklist check endpoint (called by the BullMQ blacklist-monitor worker).
 *
 *  POST /api/v1/internal/blacklist-check        — check all active dedicated IPs
 *  POST /api/v1/internal/blacklist-check?ip=X   — check a single IP
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { refreshAllIpBlacklists, refreshIpBlacklist } from '../../../services/deliverability/blacklist-monitor.js';

export default async function internalBlacklistCheckRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/blacklist-check',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();

      const query = z.object({ ip: z.string().optional() }).parse(req.query);

      if (query.ip) {
        const result = await refreshIpBlacklist(query.ip);
        return { data: { checked: 1, listed: result.totalListings > 0 ? 1 : 0, details: [result] } };
      }

      const result = await refreshAllIpBlacklists();
      return { data: result };
    },
  );
}
