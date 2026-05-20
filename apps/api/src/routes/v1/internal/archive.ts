/**
 * Internal archive endpoint (#279) — called by the workers service.
 * Not exposed to external clients (should be behind internal network in prod).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { archiveAllOrgs } from '../../../services/archive/email-events.js';

const internalArchiveRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/archive/email-events',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const { cutoffDays } = z
        .object({
          cutoffDays: z.number().int().min(1).max(365).default(30),
        })
        .parse(req.body ?? {});

      const results = await archiveAllOrgs(cutoffDays);
      const totalArchived = results.reduce((sum, r) => sum + r.rowsArchived, 0);
      const totalDeleted = results.reduce((sum, r) => sum + r.rowsDeleted, 0);

      return reply.send({
        data: { totalArchived, totalDeleted, orgsProcessed: results.length },
      });
    },
  );
};

export default internalArchiveRoutes;
