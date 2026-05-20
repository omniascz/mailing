import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createKeyword,
  listKeywords,
  deleteKeywordOrThrow,
  dispatchInboundSms,
} from '../../services/sms-keywords/index.js';

const smsKeywordRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/sms/keywords',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['SMS'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listKeywords(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/sms/keywords',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
      schema: { tags: ['SMS'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          keyword: z.string().min(1).max(64),
          action: z.enum(['subscribe', 'unsubscribe', 'info', 'reply']),
          listId: z.string().uuid().optional(),
          reply: z.string().max(500).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createKeyword(req.user!.orgId, body) });
    },
  );

  app.delete(
    '/api/v1/sms/keywords/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
      schema: { tags: ['SMS'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteKeywordOrThrow(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/sms/inbound',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['SMS'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          fromPhone: z.string().min(3).max(32),
          body: z.string().min(1).max(1600),
        })
        .parse(req.body);
      return reply.send({ data: await dispatchInboundSms(req.user!.orgId, body) });
    },
  );
};

export default smsKeywordRoutes;
