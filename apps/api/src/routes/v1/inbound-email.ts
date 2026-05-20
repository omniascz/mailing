import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { receiveInbound, listInbound, getInbound } from '../../services/inbound-email/index.js';
import { AppError } from '../../lib/app-error.js';

const inboundPayloadSchema = z.object({
  from: z.string().min(3).max(512),
  to: z.string().min(3).max(512),
  subject: z.string().max(1024).optional(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  messageId: z.string().max(512).optional(),
  inReplyTo: z.string().max(512).optional(),
  headers: z.record(z.string()).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number().int().nonnegative(),
        url: z.string().url().optional(),
      }),
    )
    .optional(),
});

/** Payload posted by the Go engine MX receiver — attachments are inline base64. */
const enginePayloadSchema = inboundPayloadSchema.extend({
  orgId: z.string().uuid().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number().int().nonnegative(),
        dataB64: z.string().optional(),
        url: z.string().url().optional(),
      }),
    )
    .optional(),
  receivedAt: z.string().optional(),
});

const inboundEmailRoutes: FastifyPluginAsync = async (app) => {
  // Public webhook endpoint — provider-agnostic. Auth via shared secret in header.
  app.post(
    '/api/v1/webhooks/inbound-email/:orgId',
    {
      schema: { tags: ['Inbound Email'] },
    },
    async (req, reply) => {
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.params);
      const secret = process.env.INBOUND_EMAIL_SECRET;
      if (secret && req.headers['x-inbound-secret'] !== secret) {
        throw AppError.unauthorized('Invalid inbound secret');
      }
      const payload = inboundPayloadSchema.parse(req.body);
      const row = await receiveInbound(orgId, payload);
      return reply.code(201).send({ data: { id: row.id, contactMatched: row.contactId !== null } });
    },
  );

  // Engine MX receiver dispatches here. Same secret check as the provider webhook.
  // The orgId is taken from the recipient lookup (or explicit body field). For
  // simplicity v1 requires orgId in the body; the engine resolves it via
  // recipient → org mapping before posting.
  app.post(
    '/api/v1/webhooks/inbound-email/raw',
    {
      schema: { tags: ['Inbound Email'], summary: 'Engine MX receiver — raw payload' },
    },
    async (req, reply) => {
      const secret = process.env.INBOUND_EMAIL_SECRET;
      if (secret && req.headers['x-inbound-secret'] !== secret) {
        throw AppError.unauthorized('Invalid inbound secret');
      }
      const payload = enginePayloadSchema.parse(req.body);
      if (!payload.orgId)
        throw AppError.badRequest('orgId required (resolve recipient before posting)');
      const row = await receiveInbound(payload.orgId, {
        ...payload,
        attachments: payload.attachments?.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          url: a.url,
        })),
      });
      return reply.code(201).send({ data: { id: row.id, contactMatched: row.contactId !== null } });
    },
  );

  app.get(
    '/api/v1/inbound-emails',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Inbound Email'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(500).optional(),
          contactId: z.string().uuid().optional(),
        })
        .parse(req.query);
      return reply.send({ data: await listInbound(req.user!.orgId, q) });
    },
  );

  app.get(
    '/api/v1/inbound-emails/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Inbound Email'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getInbound(req.user!.orgId, id) });
    },
  );
};

export default inboundEmailRoutes;
