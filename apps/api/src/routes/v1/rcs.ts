import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queueRcs, listForContact, updateStatus } from '../../services/rcs/index.js';

const carouselCardSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(2000).optional(),
  mediaUrl: z.string().url().optional(),
  actions: z
    .array(
      z.object({
        type: z.enum(['url', 'reply', 'dial']),
        label: z.string().max(100),
        value: z.string().max(500),
      }),
    )
    .optional(),
});

const payloadSchema = z.object({
  text: z.string().max(4000).optional(),
  mediaUrl: z.string().url().optional(),
  carousel: z.array(carouselCardSchema).max(10).optional(),
  suggestedReplies: z.array(z.string().max(100)).max(11).optional(),
});

const rcsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/rcs/messages',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
      schema: { tags: ['RCS'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          phone: z.string().min(3).max(32),
          contactId: z.string().uuid().optional(),
          messageType: z.enum(['text', 'carousel', 'rich_card', 'media']),
          payload: payloadSchema,
          provider: z.string().max(64).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await queueRcs(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/rcs/messages/contact/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['RCS'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .parse(req.query);
      return reply.send({ data: await listForContact(req.user!.orgId, contactId, q.limit) });
    },
  );

  app.patch(
    '/api/v1/rcs/messages/:id/status',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['RCS'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          status: z.enum(['sent', 'delivered', 'failed']),
          providerId: z.string().max(256).optional(),
          error: z.string().max(2000).optional(),
        })
        .parse(req.body);
      await updateStatus(id, body.status, { providerId: body.providerId, error: body.error });
      return reply.code(204).send();
    },
  );
};

export default rcsRoutes;
