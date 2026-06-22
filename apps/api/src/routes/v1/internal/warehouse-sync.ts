/**
 * Internal warehouse-sync runner endpoint. Triggered hourly by the workers
 * scheduler; runs every sync whose frequency interval has elapsed.
 */
import type { FastifyInstance } from 'fastify';
import { runDueSyncs } from '../../../services/warehouse-sync/index.js';

export default async function internalWarehouseSyncRoutes(app: FastifyInstance) {
  app.post('/api/v1/internal/warehouse-sync/run-due', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    if (process.env.INTERNAL_SECRET && req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) {
      return reply.status(401).send();
    }
    const result = await runDueSyncs();
    return reply.send({ data: result });
  });
}
