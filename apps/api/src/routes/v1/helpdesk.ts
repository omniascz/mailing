import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  openTicket,
  listTickets,
  getTicket,
  appendMessage,
  updateStatus,
  assignTicket,
  hasOpenTicket,
} from '../../services/helpdesk/index.js';

const helpdeskRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/helpdesk/tickets',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          status: z.enum(['open', 'pending', 'closed']).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .parse(req.query);
      return reply.send({ data: await listTickets(req.user!.orgId, q) });
    },
  );

  app.post(
    '/api/v1/helpdesk/tickets',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          subject: z.string().min(1).max(512),
          contactId: z.string().uuid().optional(),
          channel: z.enum(['email', 'chat', 'sms', 'whatsapp', 'voice']).optional(),
          priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
          body: z.string().min(1),
          tags: z.array(z.string()).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await openTicket(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/helpdesk/tickets/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getTicket(req.user!.orgId, id) });
    },
  );

  app.post(
    '/api/v1/helpdesk/tickets/:id/messages',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          sender: z.enum(['customer', 'agent', 'system']),
          body: z.string().min(1),
          attachments: z.array(z.object({ url: z.string().url(), name: z.string() })).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await appendMessage(req.user!.orgId, id, body) });
    },
  );

  app.patch(
    '/api/v1/helpdesk/tickets/:id/status',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.object({ status: z.enum(['open', 'pending', 'closed']) }).parse(req.body);
      return reply.send({ data: await updateStatus(req.user!.orgId, id, body.status) });
    },
  );

  app.patch(
    '/api/v1/helpdesk/tickets/:id/assign',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.object({ userId: z.string().uuid().nullable() }).parse(req.body);
      return reply.send({ data: await assignTicket(req.user!.orgId, id, body.userId) });
    },
  );

  app.get(
    '/api/v1/helpdesk/has-open/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Helpdesk'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: { hasOpen: await hasOpenTicket(req.user!.orgId, contactId) } });
    },
  );
};

export default helpdeskRoutes;
