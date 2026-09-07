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
import { recordAndAlert } from '../../../services/deliverability/blacklist-alerts.js';

export default async function internalBlacklistCheckRoutes(app: FastifyInstance) {
  app.post('/api/v1/internal/blacklist-check', { schema: { tags: ['Internal'] } }, async (req) => {
    const query = z.object({ ip: z.string().optional() }).parse(req.query);

    if (query.ip) {
      const result = await refreshIpBlacklist(query.ip);
      const alerts = await recordAndAlert([result]);
      return {
        data: {
          alerts,
          checked: 1,
          listed: result.totalListings > 0 ? 1 : 0,
          // A zone that refused or did not answer is not a clean IP. Reporting
          // only `listed` would let "we could not read Spamhaus" arrive as
          // "nothing lists this address".
          inconclusive: result.inconclusive ? 1 : 0,
          details: [result],
        },
      };
    }

    const result = await refreshAllIpBlacklists();

    // The sweep has run on a six-hourly cron since it was written and told
    // nobody anything — it set a column and logged a line. This is where a
    // finding leaves the process.
    const alerts = await recordAndAlert(result.details);

    return { data: { ...result, alerts } };
  });
}
