/**
 * Internal warehouse-sync runner endpoint. Triggered hourly by the workers
 * scheduler; runs every sync whose frequency interval has elapsed.
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
import { runDueSyncs } from '../../../services/warehouse-sync/index.js';

export default async function internalWarehouseSyncRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/warehouse-sync/run-due',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      const result = await runDueSyncs();
      return reply.send({ data: result });
    },
  );
}
