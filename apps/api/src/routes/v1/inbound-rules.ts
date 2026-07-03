/**
 * Inbound receipt rule management (SES Mail Manager rule sets).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listInboundRules,
  createInboundRule,
  updateInboundRule,
  deleteInboundRule,
} from '../../services/inbound-rules/index.js';

const matchSchema = z.object({
  recipientPattern: z.string().max(500).optional(),
  fromPattern: z.string().max(500).optional(),
  subjectPattern: z.string().max(500).optional(),
});

const actionSchema = z.object({
  type: z.enum(['helpdesk', 'webhook', 'workflow_event', 'store', 'drop', 'stop']),
  url: z.string().url().optional(),
  eventName: z.string().max(128).optional(),
  ticketSubjectPrefix: z.string().max(128).optional(),
});

const inboundRuleRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/inbound-rules', { schema: { tags: ['Inbound Rules'] } }, async (req) => ({
    data: await listInboundRules(req.user!.orgId),
  }));

  app.post(
    '/api/v1/inbound-rules',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Inbound Rules'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(128),
          priority: z.number().int().min(0).max(10_000).optional(),
          active: z.boolean().optional(),
          match: matchSchema.optional(),
          actions: z.array(actionSchema).min(1),
        })
        .parse(req.body);
      const row = await createInboundRule(req.user!.orgId, body);
      return reply.code(201).send({ data: row });
    },
  );

  app.patch(
    '/api/v1/inbound-rules/:id',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Inbound Rules'] },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(128).optional(),
          priority: z.number().int().min(0).max(10_000).optional(),
          active: z.boolean().optional(),
          match: matchSchema.optional(),
          actions: z.array(actionSchema).min(1).optional(),
        })
        .parse(req.body);
      return { data: await updateInboundRule(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/inbound-rules/:id',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Inbound Rules'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteInboundRule(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );
};

export default inboundRuleRoutes;
