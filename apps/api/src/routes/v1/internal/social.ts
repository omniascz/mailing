/**
 * Internal social endpoints — called by BullMQ workers.
 */

import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';
import { sql } from 'drizzle-orm';
import { dispatchDuePosts } from '../../../services/social/publisher.js';
import { runMonitoringPoll } from '../../../services/social/monitoring.js';

const internalSocialRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/social/dispatch-due', async (_req, reply) => {
    const results = await dispatchDuePosts();
    return reply.send({ data: { dispatched: results.length, results } });
  });

  app.post('/api/v1/internal/social/monitor-poll', async (_req, reply) => {
    const orgs = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(sql`deleted_at IS NULL`);

    let totalIngested = 0;
    for (const org of orgs) {
      try {
        const { ingested } = await runMonitoringPoll(org.id);
        totalIngested += ingested;
      } catch {
        /* skip */
      }
    }
    return reply.send({ data: { orgsPolled: orgs.length, totalIngested } });
  });
};

export default internalSocialRoutes;
