/**
 * Internal commerce endpoints — called by BullMQ workers.
 */

import type { FastifyPluginAsync } from 'fastify';
import { sendDueReminders, markOverdueInvoices } from '../../../services/commerce/invoicing.js';
import { syncAdPerformance } from '../../../services/ads/reporting.js';
import { sql } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';
import { sweepOrgs } from '../../../lib/per-org-sweep.js';

const internalCommerceRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/commerce/invoice-reminders', async (_req, reply) => {
    const overdue = await markOverdueInvoices();
    const reminders = await sendDueReminders();
    return reply.send({ data: { markedOverdue: overdue, remindersSent: reminders } });
  });

  app.post('/api/v1/internal/ads/sync-performance', async (_req, reply) => {
    const orgs = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(sql`deleted_at IS NULL`);
    const outcome = await sweepOrgs(
      orgs.map((o) => o.id),
      'ads-sync',
      (orgId) => syncAdPerformance(orgId),
    );
    const total = outcome.succeeded.reduce((n, r) => n + r.rowsInserted, 0);
    return reply.send({
      data: {
        orgsProcessed: outcome.attempted,
        rowsInserted: total,
        // A day's snapshot is keyed on today's date, so an org that fails here
        // has a permanent hole: tomorrow's run targets tomorrow.
        orgsFailed: outcome.failures.length,
      },
    });
  });
};

export default internalCommerceRoutes;
