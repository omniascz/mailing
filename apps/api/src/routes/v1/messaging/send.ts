/**
 * Unified messaging API (#285) — single endpoint for all channels.
 * Accepts a `channel` discriminator + a channel-specific `payload`.
 * Routes to the appropriate service layer (same as transactional.ts but
 * with a normalized envelope so callers don't need per-channel endpoints).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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
  app.post(
    '/api/v1/messaging/send',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Messaging'] },
    },
    async (req, reply) => {
      const parsed = sendSchema.parse(req.body);
      const orgId = req.user!.orgId;

      switch (parsed.channel) {
        case 'email': {
          const p = parsed.payload;
          if (!p.html && !p.text && !p.templateId) {
            return reply
              .code(400)
              .send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
          }
          // Resolve a template if given, else use inline body (was a stub that
          // logged an event but never dispatched to the MTA).
          let html = p.html ?? '';
          let text = p.text ?? '';
          let subject = p.subject;
          if (p.templateId) {
            const { renderStoredTemplate } = await import(
              '../../../services/transactional/render-template.js'
            );
            const r = await renderStoredTemplate(orgId, p.templateId, p.mergeVars ?? {});
            html = r.html;
            text = r.text;
            if (!subject) subject = r.subject;
          }
          const { sendTransactionalEmail } = await import('../../../lib/queues.js');
          const messageId = await sendTransactionalEmail({
            to: p.to,
            from: p.from,
            fromName: p.fromName,
            subject: subject || '(no subject)',
            html: html || '<p></p>',
            text: text || undefined,
            orgId,
            scheduleAt: p.scheduleAt ? new Date(p.scheduleAt) : undefined,
          });
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
          const { emitEmailEvent } = await import('../../../services/webhooks/email-events.js');
          emitEmailEvent(orgId, 'sent', { messageId, email: p.to });
          const { recordUsage } = await import('../../../services/billing/meters.js');
          recordUsage(orgId, 'email', 1).catch(() => {});
          return reply.code(202).send({
            data: { channel: 'email', messageId, status: p.scheduleAt ? 'scheduled' : 'queued' },
          });
        }

        case 'sms': {
          const p = parsed.payload;
          const { routedSmsSend } = await import('../../../services/sms/routing.js');
          // Proper UnifiedMessage envelope — routedSmsSend dereferences
          // message.content.kind/body (the old {text,from} shape crashed).
          const result = await routedSmsSend(
            orgId,
            { channel: 'sms', orgId, content: { kind: 'sms', body: p.text } },
            { phone: p.to },
          );
          return reply.code(202).send({ data: { channel: 'sms', ...result } });
        }

        case 'whatsapp': {
          const p = parsed.payload;
          const { createWhatsAppAdapter } = await import(
            '../../../channels/whatsapp/meta-adapter.js'
          );
          const adapter = createWhatsAppAdapter();
          if (!adapter) {
            return reply
              .code(503)
              .send({ code: 'WHATSAPP_UNCONFIGURED', message: 'WhatsApp is not configured' });
          }
          const result = await adapter.send(
            {
              channel: 'whatsapp',
              orgId,
              content: {
                kind: 'whatsapp',
                templateId: p.templateName,
                language: p.language,
                parameters: {},
              },
            },
            { phone: p.to },
          );
          return reply.code(202).send({ data: { channel: 'whatsapp', ...result } });
        }

        case 'push': {
          const p = parsed.payload;
          if (!p.contactId) {
            return reply
              .code(400)
              .send({ code: 'CONTACT_REQUIRED', message: 'push requires contactId' });
          }
          const { getPushAdapterForOrg } = await import('../../../services/push/get-adapter.js');
          const adapter = await getPushAdapterForOrg(orgId);
          if (!adapter) {
            return reply
              .code(503)
              .send({ code: 'PUSH_UNCONFIGURED', message: 'No VAPID keys for this org' });
          }
          const result = await adapter.send(
            {
              channel: 'push',
              orgId,
              content: { kind: 'push', title: p.title, body: p.body, url: p.actionUrl },
            },
            { contactId: p.contactId },
          );
          return reply.code(202).send({ data: { channel: 'push', ...result } });
        }

        case 'in_app': {
          return reply.code(501).send({
            code: 'NOT_IMPLEMENTED',
            message: `Channel 'in_app' is not yet wired into the unified messaging endpoint. Use the channel-specific route.`,
          });
        }
      }
    },
  );
};

export default messagingSendRoutes;
