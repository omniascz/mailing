/**
 * Internal DKIM lifecycle sweep — called by the workers cron (dkim-retire).
 *
 * Two jobs, both idempotent:
 *   - retiring keys past their grace window → retired (safe to remove from DNS)
 *   - pending keys the customer never published (stale) → deleted, so the
 *     domain is free to rotate again
 *
 * Behind the internal-auth gate; not reachable by external clients.
 */
import type { FastifyPluginAsync } from 'fastify';
import { retireExpiredKeys, expireStalePending } from '../../../services/domains/dkim-rotation.js';

const internalDkimRetireRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/dkim/retire-expired', { schema: { tags: ['Internal'] } }, async () => {
    const now = new Date();
    const retired = await retireExpiredKeys(now);
    const pendingExpired = await expireStalePending(now);
    return { data: { retired, pendingExpired } };
  });
};

export default internalDkimRetireRoutes;
