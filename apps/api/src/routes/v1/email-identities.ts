/**
 * Email identity verification + production-access request routes.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createEmailIdentity,
  confirmEmailIdentity,
  listEmailIdentities,
  deleteEmailIdentity,
  requestProductionAccess,
} from '../../services/identities/index.js';

const emailIdentityRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/email-identities',
    { preHandler: [app.requireAuth], schema: { tags: ['Identities'] } },
    async (req) => ({ data: await listEmailIdentities(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/email-identities',
    {
      preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Identities'], summary: 'Verify an email address identity' },
    },
    async (req, reply) => {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const row = await createEmailIdentity(req.user!.orgId, email);
      return reply.code(201).send({ data: { id: row.id, email: row.email, status: row.status } });
    },
  );

  app.delete(
    '/api/v1/email-identities/:id',
    {
      preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Identities'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteEmailIdentity(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // Public confirmation link (no auth — the token is the credential).
  app.get(
    '/api/v1/email-identities/confirm/:token',
    { schema: { tags: ['Identities'], summary: 'Confirm an email identity' } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
      const ok = await confirmEmailIdentity(token);
      return reply
        .type('text/html')
        .send(
          ok
            ? '<h1>Address verified ✓</h1><p>You can now send from/to this address.</p>'
            : '<h1>Invalid or expired link</h1>',
        );
    },
  );

  // Request production access (leaves sandbox).
  app.post(
    '/api/v1/account/production-access',
    {
      preHandler: [app.requireAuth, app.requireRole('admin', 'owner')],
      schema: { tags: ['Account'], summary: 'Request production sending access' },
    },
    async (req) => {
      const body = z
        .object({
          useCase: z.string().min(10).max(2000),
          website: z.string().url().optional(),
          expectedVolume: z.string().max(100).optional(),
        })
        .parse(req.body);
      await requestProductionAccess(req.user!.orgId, body);
      return { data: { status: 'pending', message: 'Production access requested — under review.' } };
    },
  );
};

export default emailIdentityRoutes;
