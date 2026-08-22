/**
 * GET /api/v1/capabilities — what this deployment can do, derived from config.
 *
 * The frontend hides features it cannot use, and it has to learn which those
 * are from here rather than from its own copy of the environment. Read fresh on
 * every request, so a newly configured integration appears without a redeploy
 * of the web app.
 */
import type { FastifyPluginAsync } from 'fastify';
import { capabilities } from '../../lib/integration-capabilities.js';

const capabilityRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/capabilities',
    { schema: { tags: ['Meta'], summary: 'Features available in this deployment' } },
    async () => ({ data: capabilities() }),
  );
};

export default capabilityRoutes;
