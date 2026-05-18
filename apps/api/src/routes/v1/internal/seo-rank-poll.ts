/**
 * Internal SEO rank-poll endpoint (#292) — called by the workers cron.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fetchAllOrgRanks } from '../../../services/seo/rank-tracker.js';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';
import { sql } from 'drizzle-orm';

const internalSeoRankPollRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/seo/rank-poll', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
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

    let total = 0;
    for (const org of orgs) {
      try {
        const results = await fetchAllOrgRanks(org.id);
        total += results.length;
      } catch {
        // continue with next org
      }
    }

    return reply.send({ data: { orgsProcessed: orgs.length, snapshots: total } });
  });
};

export default internalSeoRankPollRoutes;
