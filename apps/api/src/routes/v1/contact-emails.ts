import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  addEmail,
  listEmails,
  setPrimary,
  setConsent,
  verifyEmail,
  removeEmail,
  bestSendableEmail,
} from '../../services/multi-email/index.js';

const contactEmailRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/contacts/:contactId/emails',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await listEmails(contactId) });
    },
  );

  app.post(
    '/api/v1/contacts/:contactId/emails',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          email: z.string().email(),
          isPrimary: z.boolean().optional(),
          consent: z.enum(['pending', 'subscribed', 'unsubscribed']).optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await addEmail(req.user!.orgId, contactId, body) });
    },
  );

  app.patch(
    '/api/v1/contacts/:contactId/emails/:emailId/primary',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const p = z
        .object({ contactId: z.string().uuid(), emailId: z.string().uuid() })
        .parse(req.params);
      return reply.send({ data: await setPrimary(p.contactId, p.emailId) });
    },
  );

  app.patch(
    '/api/v1/contacts/:contactId/emails/:emailId/consent',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const p = z
        .object({ contactId: z.string().uuid(), emailId: z.string().uuid() })
        .parse(req.params);
      const body = z.object({ consent: z.enum(['subscribed', 'unsubscribed']) }).parse(req.body);
      return reply.send({ data: await setConsent(p.contactId, p.emailId, body.consent) });
    },
  );

  app.post(
    '/api/v1/contacts/:contactId/emails/:emailId/verify',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const p = z
        .object({ contactId: z.string().uuid(), emailId: z.string().uuid() })
        .parse(req.params);
      return reply.send({ data: await verifyEmail(p.contactId, p.emailId) });
    },
  );

  app.delete(
    '/api/v1/contacts/:contactId/emails/:emailId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const p = z
        .object({ contactId: z.string().uuid(), emailId: z.string().uuid() })
        .parse(req.params);
      await removeEmail(p.contactId, p.emailId);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/contacts/:contactId/emails/best',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Contacts'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await bestSendableEmail(contactId) });
    },
  );
};

export default contactEmailRoutes;
