/**
 * Internal commerce endpoints — called by BullMQ workers.
 */

import type { FastifyPluginAsync } from 'fastify';
import { sendDueReminders, markOverdueInvoices } from '../../../services/commerce/invoicing.js';
import { syncAdPerformance } from '../../../services/ads/reporting.js';
import { sql } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { organizations } from '../../../db/schema/index.js';

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
    let total = 0;
    for (const org of orgs) {
      try {
        const result = await syncAdPerformance(org.id);
        total += result.rowsInserted;
      } catch {
        /* skip */
      }
    }
    return reply.send({ data: { orgsProcessed: orgs.length, rowsInserted: total } });
  });
};

export default internalCommerceRoutes;
