import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listRules,
  upsertRule,
  canSend,
  recordSend,
  pruneSendLog,
} from '../../services/smart-sending/index.js';

const smartSendingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/smart-sending/rules',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['SmartSending'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listRules(req.user!.orgId) });
    },
  );

  app.put(
    '/api/v1/smart-sending/rules',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['SmartSending'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          channel: z.enum(['email', 'sms', 'push', 'whatsapp', 'rcs']),
          maxPerDay: z.number().int().min(0).max(50).optional(),
          maxPerWeek: z.number().int().min(0).max(200).optional(),
          cooldownHours: z.number().int().min(0).max(168).optional(),
          enabled: z.boolean().optional(),
        })
        .parse(req.body);
      return reply.send({ data: await upsertRule(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/smart-sending/check',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['SmartSending'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          contactId: z.string().uuid(),
          channel: z.string(),
        })
        .parse(req.query);
      return reply.send({ data: await canSend(req.user!.orgId, q.contactId, q.channel) });
    },
  );

  app.post(
    '/api/v1/smart-sending/record',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['SmartSending'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          contactId: z.string().uuid(),
          channel: z.string(),
        })
        .parse(req.body);
      await recordSend(req.user!.orgId, body.contactId, body.channel);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/smart-sending/prune',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['SmartSending'] },
    },
    async (_req, reply) => {
      return reply.send({ data: await pruneSendLog() });
    },
  );
};

export default smartSendingRoutes;
