/**
 * Internal social endpoints — called by BullMQ workers.
 */

import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';
import { sql } from 'drizzle-orm';
import { dispatchDuePosts } from '../../../services/social/publisher.js';
import { runMonitoringPoll } from '../../../services/social/monitoring.js';
import { sweepOrgs } from '../../../lib/per-org-sweep.js';

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

    const outcome = await sweepOrgs(
      orgs.map((o) => o.id),
      'social-monitor',
      (orgId) => runMonitoringPoll(orgId),
    );
    const totalIngested = outcome.succeeded.reduce((n, r) => n + r.ingested, 0);
    return reply.send({
      data: {
        orgsPolled: outcome.attempted,
        totalIngested,
        // This poll re-reads a rolling window every 15 minutes, so a transient
        // failure does recover. A permanent one — a revoked token — does not,
        // and used to be invisible.
        orgsFailed: outcome.failures.length,
      },
    });
  });
};

export default internalSocialRoutes;
