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

  /**
   * CSAT submission — authenticated, org from the session.
   *
   * It had no `preHandler` and took `orgId` from the request body, so the
   * caller named the tenant it was writing to: an unauthenticated POST with a
   * guessed ticket UUID and org UUID set `channel_metadata.csat_score` on
   * another customer's ticket.
   *
   * Auth rather than a signed token, and that is a deliberate choice about
   * what exists. A mailed "rate this ticket" link would need a token, but
   * nothing in this repository sends one — `csat` appears only here, in the
   * survey templates, and in a workflow-template slug; there is no producer of
   * a CSAT URL anywhere. Inventing a token flow would mean writing the
   * verification half of a chain whose other half does not exist, which is the
   * mistake services/meetings/workflows.ts documents at length. When someone
   * builds the mailed link, the token belongs in that change, next to the
   * thing that issues it.
   *
   * `orgId` leaves the body entirely rather than being validated against the
   * session — a field that must equal the session value is a field with no
   * job, and leaving it accepted invites a caller to keep sending it.
   */
  app.post(
    '/api/v1/helpdesk/tickets/:id/csat',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { score } = z
        .object({
          score: z.number().int().min(1).max(5),
        })
        .parse(req.body);
      await recordCsat(req.user!.orgId, id, score);
      return reply.send({ data: { recorded: true } });
    },
  );
};

export default helpdeskAnalyticsRoutes;
