/**
 * Internal SEO rank-poll endpoint (#292) — called by the workers cron.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fetchAllOrgRanks } from '../../../services/seo/rank-tracker.js';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';
import { sql } from 'drizzle-orm';
import { sweepOrgs } from '../../../lib/per-org-sweep.js';

const internalSeoRankPollRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/internal/seo/rank-poll',
    {
      schema: { tags: ['Internal'] },
    },
    async (req, reply) => {
      const q = z.object({ orgId: z.string().uuid().optional() }).parse(req.query ?? {});

      if (q.orgId) {
        const results = await fetchAllOrgRanks(q.orgId);
        return reply.send({ data: { orgsProcessed: 1, snapshots: results.length } });
      }

      // Poll all active orgs
      const orgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(sql`deleted_at IS NULL`);

      const outcome = await sweepOrgs(
        orgs.map((o) => o.id),
        'seo-rank-poll',
        (orgId) => fetchAllOrgRanks(orgId),
      );
      const total = outcome.succeeded.reduce((n, r) => n + r.length, 0);

      return reply.send({
        data: {
          orgsProcessed: outcome.attempted,
          snapshots: total,
          // Daily series. An org that fails today has no row for today, and
          // tomorrow's run does not go back for it.
          orgsFailed: outcome.failures.length,
        },
      });
    },
  );
};

export default internalSeoRankPollRoutes;
