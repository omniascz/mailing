/**
 * Internal ClickHouse ops endpoints (secret-gated).
 *   POST /internal/clickhouse/migrate    — create DB/tables/MV (idempotent)
 *   POST /internal/clickhouse/replicate  — drain new email_events PG → CH
 * The replicate endpoint is triggered every minute by the workers scheduler.
 */
import type { FastifyInstance } from 'fastify';
import { ensureClickHouseSchema } from '../../../services/analytics/clickhouse/schema.js';
import { replicateUntilCaughtUp } from '../../../services/analytics/clickhouse/replicator.js';
import { isClickHouseEnabled } from '../../../services/analytics/clickhouse/client.js';

function ok(req: { headers: Record<string, unknown> }): boolean {
  return !process.env.INTERNAL_SECRET || req.headers['x-internal-secret'] === process.env.INTERNAL_SECRET;
}

export default async function internalClickHouseRoutes(app: FastifyInstance) {
  app.post('/api/v1/internal/clickhouse/migrate', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    if (!ok(req)) return reply.status(401).send();
    if (!isClickHouseEnabled()) return reply.send({ data: { enabled: false } });
    await ensureClickHouseSchema();
    return reply.send({ data: { enabled: true, migrated: true } });
  });

  app.post('/api/v1/internal/clickhouse/replicate', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    if (!ok(req)) return reply.status(401).send();
    const result = await replicateUntilCaughtUp();
    return reply.send({ data: result });
  });
}
