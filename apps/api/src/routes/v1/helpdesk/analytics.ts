/**
 * Chat analytics routes (#247)
 *
 *  GET  /api/v1/helpdesk/analytics  — aggregate metrics for the period
 *  POST /api/v1/helpdesk/tickets/:id/csat — submit CSAT score
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getHelpdeskAnalytics, recordCsat } from '../../../services/helpdesk/analytics.js';

const helpdeskAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/helpdesk/analytics',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const query = z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          channel: z.string().max(64).optional(),
          agentId: z.string().uuid().optional(),
        })
        .parse(req.query);

      const now = new Date();
      const from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 86_400_000);
      const to = query.to ? new Date(query.to) : now;

      const result = await getHelpdeskAnalytics({
        orgId: req.user!.orgId,
        from,
        to,
        channel: query.channel,
        agentId: query.agentId,
      });
      return reply.send({ data: result });
    },
  );

  app.post(
    '/api/v1/helpdesk/tickets/:id/csat',
    {
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { score, orgId } = z
        .object({
          score: z.number().int().min(1).max(5),
          orgId: z.string().uuid(),
        })
        .parse(req.body);
      await recordCsat(orgId, id, score);
      return reply.send({ data: { recorded: true } });
    },
  );
};

export default helpdeskAnalyticsRoutes;
