/**
 * Internal ClickHouse ops endpoints (secret-gated).
 *   POST /internal/clickhouse/migrate    — create DB/tables/MV (idempotent)
 *   POST /internal/clickhouse/replicate  — drain new email_events PG → CH
 * The replicate endpoint is triggered every minute by the workers scheduler.
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
import { ensureClickHouseSchema } from '../../../services/analytics/clickhouse/schema.js';
import { replicateUntilCaughtUp } from '../../../services/analytics/clickhouse/replicator.js';
import { isClickHouseEnabled } from '../../../services/analytics/clickhouse/client.js';

export default async function internalClickHouseRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/clickhouse/migrate',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      if (!isClickHouseEnabled()) return reply.send({ data: { enabled: false } });
      await ensureClickHouseSchema();
      return reply.send({ data: { enabled: true, migrated: true } });
    },
  );

  app.post(
    '/api/v1/internal/clickhouse/replicate',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      const result = await replicateUntilCaughtUp();
      return reply.send({ data: result });
    },
  );
}
