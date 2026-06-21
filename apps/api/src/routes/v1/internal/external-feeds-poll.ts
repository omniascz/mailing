/**
 * Internal external-feed poll endpoint (#286) — called by the workers cron.
 */

import type { FastifyPluginAsync } from 'fastify';
import { pollDueFeeds } from '../../../services/external-feeds/index.js';

const internalExternalFeedPollRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/external-feeds/poll',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      const results = await pollDueFeeds();
      const totalItems = results.reduce((acc, r) => acc + r.itemsProcessed, 0);
      const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);
      return reply.send({ data: { feeds: results.length, totalItems, totalErrors, results } });
    },
  );
};

export default internalExternalFeedPollRoutes;
