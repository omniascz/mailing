/**
 * SMTP submission credential management (customer-facing) + the internal
 * endpoints the Go port-587 submission server calls to authenticate an AUTH
 * attempt and to relay a received message.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSmtpCredential,
  listSmtpCredentials,
  deleteSmtpCredential,
  validateSmtpCredential,
} from '../../services/smtp/credentials.js';

function checkSecret(secret: unknown): boolean {
  return !process.env.INTERNAL_SECRET || secret === process.env.INTERNAL_SECRET;
}

const smtpCredentialRoutes: FastifyPluginAsync = async (app) => {
  // ── Customer-facing credential management ─────────────────────────────────
  app.get(
    '/api/v1/smtp-credentials',
    { preHandler: [app.requireAuth], schema: { tags: ['SMTP'] } },
    async (req) => {
      return { data: await listSmtpCredentials(req.user!.orgId) };
    },
  );

  app.post(
    '/api/v1/smtp-credentials',
    {
      preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['SMTP'], summary: 'Issue SMTP credentials (password shown once)' },
    },
    async (req, reply) => {
      const body = z.object({ label: z.string().max(100).optional() }).parse(req.body ?? {});
      const cred = await createSmtpCredential(req.user!.orgId, body.label);
      return reply.code(201).send({
        data: {
          ...cred,
          host: process.env.SMTP_SUBMISSION_HOST ?? 'smtp.forgemsg.io',
          ports: [587, 465, 2587],
          note: 'Save the password now — it cannot be retrieved again.',
        },
      });
    },
  );

  app.delete(
    '/api/v1/smtp-credentials/:id',
    {
      preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['SMTP'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteSmtpCredential(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ── Internal: called by the Go submission server ──────────────────────────
  app.post('/api/v1/internal/smtp/auth', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    if (!checkSecret(req.headers['x-internal-secret'])) return reply.status(401).send();
    const body = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const orgId = await validateSmtpCredential(body.username, body.password);
    if (!orgId) return reply.status(401).send({ ok: false });
    return reply.send({ data: { ok: true, orgId } });
  });

  app.post(
    '/api/v1/internal/smtp/relay',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!checkSecret(req.headers['x-internal-secret'])) return reply.status(401).send();
      const body = z
        .object({
          orgId: z.string().uuid(),
          raw: z.string().min(10), // base64
          mailFrom: z.string().optional(),
          rcptTo: z.array(z.string()).max(100).optional(),
        })
        .parse(req.body);
      const rawStr = Buffer.from(body.raw, 'base64').toString('utf8');
      const { sendRawMessage } = await import('../../services/transactional/raw-send.js');
      try {
        const result = await sendRawMessage(body.orgId, rawStr, {
          envelopeFrom: body.mailFrom,
          envelopeTo: body.rcptTo,
          metadata: { via: 'smtp' },
        });
        return reply.send({ data: result });
      } catch (err) {
        return reply.status(502).send({ error: (err as Error).message });
      }
    },
  );
};

export default smtpCredentialRoutes;
