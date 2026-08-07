/**
 * Internal blacklist check endpoint (called by the BullMQ blacklist-monitor worker).
 *
 *  POST /api/v1/internal/blacklist-check        — check all active dedicated IPs
 *  POST /api/v1/internal/blacklist-check?ip=X   — check a single IP
 */

/**
 * Auth for every route in this file is the internal-auth plugin's onRequest
 * hook: it covers each /api/v1/internal/* path and compares x-internal-secret
 * against env.INTERNAL_API_SECRET in constant time.
 *
 * These handlers used to repeat that check by hand against
 * the legacy `INTERNAL_SECRET` env name — which the API neither validates nor any
 * deployment sets. Two gates that disagree are worse than one, so the
 * duplicates are gone rather than corrected.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  refreshAllIpBlacklists,
  refreshIpBlacklist,
} from '../../../services/deliverability/blacklist-monitor.js';

export default async function internalBlacklistCheckRoutes(app: FastifyInstance) {
  app.post('/api/v1/internal/blacklist-check', { schema: { tags: ['Internal'] } }, async (req) => {
    const query = z.object({ ip: z.string().optional() }).parse(req.query);

    if (query.ip) {
      const result = await refreshIpBlacklist(query.ip);
      return {
        data: { checked: 1, listed: result.totalListings > 0 ? 1 : 0, details: [result] },
      };
    }

    const result = await refreshAllIpBlacklists();
    return { data: result };
  });
}
