/**
 * Campaign alerts routes (4.4 — anomaly detection):
 *
 *  GET   /api/v1/alerts                   — list org alerts (recent, unacknowledged first)
 *  POST  /api/v1/alerts/:id/acknowledge   — acknowledge an alert
 *  POST  /api/v1/alerts/run-check         — manually trigger anomaly check (admin)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaignAlerts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { runAnomalyCheckForOrg } from '../../services/analytics/anomaly-detector.js';

const idParam = z.object({ id: z.string().uuid() });

export default async function alertRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * GET /api/v1/alerts
   * Returns recent org alerts, unacknowledged first, max 100.
   */
  app.get(
    '/api/v1/alerts',
    {
      schema: {
        tags: ['Alerts'],
        summary: 'List org anomaly alerts',
        querystring: {
          type: 'object',
          properties: {
            unacknowledged: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { unacknowledged = 'false', limit: limitStr = '50' } = z
        .object({
          unacknowledged: z.string().optional().default('false'),
          limit: z.string().optional().default('50'),
        })
        .parse(req.query);

      const orgId = req.user!.orgId;
      const limit = Math.min(parseInt(limitStr, 10) || 50, 100);

      const conditions = [eq(campaignAlerts.orgId, orgId)];
      if (unacknowledged === 'true') {
        conditions.push(eq(campaignAlerts.acknowledged, false));
      }

      const rows = await db
        .select()
        .from(campaignAlerts)
        .where(and(...conditions))
        .orderBy(desc(campaignAlerts.createdAt))
        .limit(limit);

      return { data: rows };
    },
  );

  /**
   * POST /api/v1/alerts/:id/acknowledge
   * Mark an alert as acknowledged.
   */
  app.post(
    '/api/v1/alerts/:id/acknowledge',
    {
      schema: {
        tags: ['Alerts'],
        summary: 'Acknowledge an alert',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const orgId = req.user!.orgId;

      const [row] = await db
        .update(campaignAlerts)
        .set({ acknowledged: true, acknowledgedAt: new Date() })
        .where(and(eq(campaignAlerts.id, id), eq(campaignAlerts.orgId, orgId)))
        .returning();

      if (!row) {
        throw AppError.notFound('Alert not found');
      }

      return { data: row };
    },
  );

  /**
   * POST /api/v1/alerts/run-check
   * Manually trigger anomaly detection for the current org (useful for testing).
   * Only allowed for owners and admins.
   */
  app.post(
    '/api/v1/alerts/run-check',
    {
      schema: {
        tags: ['Alerts'],
        summary: 'Manually trigger anomaly check',
      },
    },
    async (req) => {
      const orgId = req.user!.orgId;
      const result = await runAnomalyCheckForOrg(orgId);
      return { data: { alertsCreated: result.alerts.length, alerts: result.alerts } };
    },
  );
}
