/**
 * Internal RFM refresh — called once per day by the daily-run orchestrator
 * (and by Sprint E.7 standalone cron if a tenant needs an earlier refresh).
 *
 * Iterates every org with at least one buyer and recomputes RFM quintiles
 * against the org's own distribution. Sequential per-org so the connection
 * pool doesn't get hammered — each call is a full scan + N updates against
 * contact_engagement, and large orgs can have hundreds of thousands of rows.
 */

import type { FastifyPluginAsync } from 'fastify';
import { refreshAllOrgsRfm, refreshOrgRfm } from '../../../services/rfm/index.js';
import { z } from 'zod';

const internalRfmRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/rfm/refresh-all',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh RFM scores for every org (daily cron)',
      },
    },
    async (_req, reply) => {
      const result = await refreshAllOrgsRfm();
      return reply.send({ data: result });
    },
  );

  app.post(
    '/api/v1/internal/rfm/refresh',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Refresh RFM scores for a single org',
      },
    },
    async (req, reply) => {
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.body);
      const result = await refreshOrgRfm(orgId);
      return reply.send({ data: result });
    },
  );
};

export default internalRfmRoutes;
