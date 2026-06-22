/**
 * Custom Channels routes (#347).
 *
 *   POST   /api/v1/channels/custom                        — register (admin)
 *   GET    /api/v1/channels/custom                        — list
 *   POST   /api/v1/channels/custom/:id/rotate-secret      — admin
 *   POST   /api/v1/channels/custom/:id/disable            — admin
 *   DELETE /api/v1/channels/custom/:id                    — admin
 *   POST   /api/v1/channels/custom/:slug/test             — admin: send a test payload
 *   POST   /api/v1/channels/custom/:orgId/:slug/inbound   — public webhook (HMAC-verified)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  registerChannel,
  listChannels,
  getChannelBySlug,
  disableChannel,
  deleteChannel,
  rotateSecret,
  dispatch,
  verifyInbound,
} from '../../services/custom-channels/index.js';
import { AppError } from '../../lib/app-error.js';

const customChannelRoutes: FastifyPluginAsync = async (app) => {
  // ── Authenticated management endpoints ────────────────────────────────────

  app.get(
    '/api/v1/channels/custom',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listChannels(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/channels/custom',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          slug: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[a-z0-9-]+$/),
          name: z.string().min(1).max(128),
          description: z.string().max(500).optional(),
          outboundUrl: z.string().url(),
          messageSchema: z.record(z.unknown()).optional(),
          rateLimits: z
            .object({
              rps: z.number().int().positive().optional(),
              maxPayloadBytes: z.number().int().positive().optional(),
            })
            .optional(),
        })
        .parse(req.body);
      const result = await registerChannel(req.user!.orgId, body);
      return reply.code(201).send({ data: result });
    },
  );

  app.post(
    '/api/v1/channels/custom/:id/rotate-secret',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await rotateSecret(req.user!.orgId, id) });
    },
  );

  app.post(
    '/api/v1/channels/custom/:id/disable',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await disableChannel(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/v1/channels/custom/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteChannel(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // Admin test — dispatch a stub payload to the channel's outbound URL.
  app.post(
    '/api/v1/channels/custom/:slug/test',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(64) }).parse(req.params);
      const body = z
        .object({
          to: z.union([z.string(), z.array(z.string())]),
          body: z.string().min(1),
          subject: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const testMessageId = `test-${Date.now()}`;
      return reply.send({
        data: await dispatch(req.user!.orgId, slug, testMessageId, body),
      });
    },
  );

  // ── Public inbound webhook — HMAC-verified, no auth ───────────────────────
  app.post(
    '/api/v1/channels/custom/:orgId/:slug/inbound',
    {
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const { orgId, slug } = z
        .object({
          orgId: z.string().uuid(),
          slug: z.string().min(1).max(64),
        })
        .parse(req.params);

      const sigHeader = req.headers['x-forgemsg-signature'];
      if (typeof sigHeader !== 'string') {
        throw AppError.badRequest('Missing x-forgemsg-signature header');
      }
      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

      const verified = await verifyInbound<Record<string, unknown>>(
        orgId,
        slug,
        rawBody,
        sigHeader,
      );
      // Inbound pipeline fan-out is handled elsewhere; here we just ack.
      void verified;
      return reply.send({ ok: true });
    },
  );

  // Discovery — fetch public metadata for a channel (used by the SDK setup flow).
  app.get(
    '/api/v1/channels/custom/:slug',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CustomChannels'] },
    },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(64) }).parse(req.params);
      const channel = await getChannelBySlug(req.user!.orgId, slug);
      if (!channel) throw AppError.notFound('Custom channel not found');
      const { sharedSecret: _s, ...safe } = channel;
      return reply.send({ data: safe });
    },
  );
};

export default customChannelRoutes;
