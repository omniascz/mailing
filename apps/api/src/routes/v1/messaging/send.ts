/**
 * Unified messaging API (#285) — single endpoint for all channels.
 * Accepts a `channel` discriminator + a channel-specific `payload`.
 * Routes to the appropriate service layer (same as transactional.ts but
 * with a normalized envelope so callers don't need per-channel endpoints).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../../../db/client.js';
import { emailEvents } from '../../../db/schema/index.js';

// ── Per-channel payload schemas ───────────────────────────────────────────────

const emailPayload = z.object({
  to: z.string().email(),
  from: z.string().email(),
  fromName: z.string().max(100).optional(),
  subject: z.string().min(1).max(500),
  html: z.string().optional(),
  text: z.string().optional(),
  templateId: z.string().uuid().optional(),
  mergeVars: z.record(z.string()).optional(),
  scheduleAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

const smsPayload = z.object({
  to: z.string().min(5).max(32),
  from: z.string().max(32).optional(),
  text: z.string().min(1).max(1600),
  metadata: z.record(z.unknown()).optional(),
});

const whatsappPayload = z.object({
  to: z.string().min(5).max(32),
  templateName: z.string().min(1),
  language: z.string().default('en'),
  components: z.array(z.record(z.unknown())).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const pushPayload = z.object({
  contactId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  imageUrl: z.string().url().optional(),
  actionUrl: z.string().url().optional(),
  data: z.record(z.unknown()).optional(),
});

const inAppPayload = z.object({
  contactId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  actionUrl: z.string().url().optional(),
  data: z.record(z.unknown()).optional(),
});

const sendSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), payload: emailPayload }),
  z.object({ channel: z.literal('sms'), payload: smsPayload }),
  z.object({ channel: z.literal('whatsapp'), payload: whatsappPayload }),
  z.object({ channel: z.literal('push'), payload: pushPayload }),
  z.object({ channel: z.literal('in_app'), payload: inAppPayload }),
]);

// ── Route ─────────────────────────────────────────────────────────────────────

const messagingSendRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/messaging/send', {
    preHandler: [app.authenticate],
    schema: { tags: ['Messaging'] },
  }, async (req, reply) => {
    const parsed = sendSchema.parse(req.body);
    const orgId = req.user!.orgId;

    switch (parsed.channel) {
      case 'email': {
        const p = parsed.payload;
        if (!p.html && !p.text && !p.templateId) {
          return reply.code(400).send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
        }
        const messageId = `<${randomUUID()}@forgemsg>`;
        await db.insert(emailEvents).values({
          orgId,
          eventType: 'send',
          messageId,
          metadata: {
            to: p.to,
            transactional: true,
            unified: true,
            tags: p.tags ?? [],
            scheduleAt: p.scheduleAt ?? null,
            ...p.metadata,
          },
        });
        return reply.code(202).send({ data: { channel: 'email', messageId, status: p.scheduleAt ? 'scheduled' : 'queued' } });
      }

      case 'sms': {
        const p = parsed.payload;
        const { routedSmsSend } = await import('../../../services/sms/routing.js');
        const result = await routedSmsSend(orgId, { text: p.text, from: p.from } as never, { phone: p.to } as never);
        return reply.code(202).send({ data: { channel: 'sms', ...result } });
      }

      case 'whatsapp':
      case 'push':
      case 'in_app': {
        return reply.code(501).send({
          code: 'NOT_IMPLEMENTED',
          message: `Channel '${parsed.channel}' is not yet wired into the unified messaging endpoint. Use the channel-specific route.`,
        });
      }
    }
  });
};

export default messagingSendRoutes;
