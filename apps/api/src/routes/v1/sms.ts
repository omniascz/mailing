/**
 * SMS API routes — tasks 7.3, 7.4, 7.5.
 *
 * Routes:
 *   Provider routing (7.3):
 *     GET    /api/v1/sms/routes
 *     POST   /api/v1/sms/routes
 *     PUT    /api/v1/sms/routes/:id
 *     DELETE /api/v1/sms/routes/:id
 *     GET    /api/v1/sms/routes/stats
 *
 *   Inbound / two-way (7.4):
 *     GET    /api/v1/sms/inbound
 *     POST   /api/v1/sms/webhooks/bulkgate/dlr      (provider DLR webhook)
 *     POST   /api/v1/sms/webhooks/twilio/status     (Twilio status callback)
 *     POST   /api/v1/sms/webhooks/twilio/inbound    (Twilio inbound)
 *     POST   /api/v1/sms/webhooks/whatsapp/status   (Meta WA status webhook)
 *     GET    /api/v1/sms/webhooks/whatsapp/verify   (Meta webhook verification challenge)
 *     POST   /api/v1/sms/webhooks/whatsapp/inbound  (Meta WA inbound)
 *
 *   Compliance (7.5):
 *     GET    /api/v1/sms/consents
 *     POST   /api/v1/sms/consents
 *     DELETE /api/v1/sms/consents/:phone
 *     POST   /api/v1/sms/compliance/check           (pre-send gate)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listSmsRoutes,
  createSmsRoute,
  updateSmsRoute,
  deleteSmsRoute,
  getSmsSendStats,
  updateSmsDeliveryStatus,
} from '../../services/sms/routing.js';
import { processInboundSms, listInboundSms } from '../../services/sms/inbound.js';
import {
  recordConsent,
  revokeConsent,
  listConsents,
  checkSmsCompliance,
} from '../../services/sms/compliance.js';
import { BulkgateSmsAdapter } from '../../channels/sms/bulkgate-adapter.js';

import { MetaWhatsAppAdapter } from '@forgemsg/shared/whatsapp/meta-adapter';
import type { InboundMessage } from '@forgemsg/shared';

export default async function smsRoutes(app: FastifyInstance) {
  // ── Provider routing ──────────────────────────────────────────────────────

  app.get('/api/v1/sms/routes', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const routes = await listSmsRoutes(orgId);
    return { data: routes };
  });

  const createRouteSchema = z.object({
    countryCode: z.string().min(1).max(4),
    provider: z.enum(['bulkgate', 'twilio']),
    priority: z.number().int().min(1).default(1),
    active: z.boolean().default(true),
    costPerSms: z.string().optional(),
    config: z.record(z.unknown()),
  });

  app.post('/api/v1/sms/routes', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const data = createRouteSchema.parse(req.body);
    const route = await createSmsRoute(orgId, data);
    return reply.status(201).send({ data: route });
  });

  const updateRouteSchema = z.object({
    priority: z.number().int().min(1).optional(),
    active: z.boolean().optional(),
    costPerSms: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  });

  app.put('/api/v1/sms/routes/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { id } = req.params as { id: string };
    const data = updateRouteSchema.parse(req.body);
    const route = await updateSmsRoute(id, orgId, data);
    return { data: route };
  });

  app.delete('/api/v1/sms/routes/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const { id } = req.params as { id: string };
    await deleteSmsRoute(id, orgId);
    return reply.status(204).send();
  });

  app.get('/api/v1/sms/routes/stats', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const stats = await getSmsSendStats(orgId);
    return { data: stats };
  });

  // ── Inbound messages ──────────────────────────────────────────────────────

  app.get('/api/v1/sms/inbound', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { limit = 50 } = req.query as { limit?: number };
    const messages = await listInboundSms(orgId, Number(limit));
    return { data: messages };
  });

  // ── Provider webhooks ─────────────────────────────────────────────────────
  // These endpoints are public (signed by provider, no JWT)

  /** Bulkgate DLR webhook */
  app.post('/api/v1/sms/webhooks/bulkgate/dlr', async (req, reply) => {
    const payload = req.body as Record<string, unknown>;

    // Resolve orgId from DLR data (app_id stored in send log or passed as custom param)
    // For now accept the DLR and process via adapter's handleInbound
    const adapter = new BulkgateSmsAdapter({
      applicationId: '',
      applicationToken: '',
    });

    await adapter.handleInbound(payload);
    const smsId = (payload as { sms_id?: string }).sms_id ?? '';
    const status = (payload as { status?: string }).status ?? '';

    // Map Bulkgate DLR status to our status
    const statusMap: Record<string, string> = {
      delivered: 'delivered',
      undelivered: 'failed',
      expired: 'failed',
      rejected: 'failed',
    };

    await updateSmsDeliveryStatus(
      smsId,
      statusMap[status] ?? status,
      status === 'delivered' ? new Date() : undefined,
    );

    return reply.status(200).send({ ok: true });
  });

  /** Twilio status callback webhook */
  app.post('/api/v1/sms/webhooks/twilio/status', async (req, reply) => {
    const payload = req.body as Record<string, string>;
    const msgSid = payload.MessageSid ?? '';
    const msgStatus = payload.MessageStatus ?? '';

    const statusMap: Record<string, string> = {
      delivered: 'delivered',
      failed: 'failed',
      undelivered: 'failed',
      sent: 'sent',
      queued: 'queued',
    };

    await updateSmsDeliveryStatus(
      msgSid,
      statusMap[msgStatus] ?? msgStatus,
      msgStatus === 'delivered' ? new Date() : undefined,
    );

    return reply.status(204).send();
  });

  /** Twilio inbound SMS webhook */
  app.post('/api/v1/sms/webhooks/twilio/inbound', async (req, reply) => {
    const payload = req.body as Record<string, string>;

    // Twilio sends x-www-form-urlencoded
    const inboundMsg: InboundMessage = {
      channel: 'sms',
      from: payload.From ?? '',
      to: payload.To,
      content: payload.Body ?? '',
      receivedAt: new Date(),
      providerMessageId: payload.MessageSid,
      metadata: { provider: 'twilio' },
    };

    // Need orgId — derive from the To number (our number) registered in env
    // In a real multi-tenant setup this would look up orgId from the inbound To number
    const orgId = process.env.DEFAULT_ORG_ID ?? '';

    if (orgId) {
      const result = await processInboundSms(orgId, 'twilio', inboundMsg);

      // Return TwiML auto-reply if applicable
      if (result.autoReply) {
        reply.header('Content-Type', 'text/xml');
        return reply.send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${result.autoReply}</Message></Response>`,
        );
      }
    }

    reply.header('Content-Type', 'text/xml');
    return reply.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  });

  /** Meta WhatsApp webhook verification (GET challenge) */
  app.get('/api/v1/sms/webhooks/whatsapp/verify', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN ?? '')) {
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send({ error: 'Forbidden' });
  });

  /** Meta WhatsApp status + inbound webhook */
  app.post('/api/v1/sms/webhooks/whatsapp/inbound', async (req, reply) => {
    const payload = req.body as Record<string, unknown>;
    const orgId = process.env.DEFAULT_ORG_ID ?? '';

    if (orgId) {
      const adapter = new MetaWhatsAppAdapter({
        phoneNumberId: '',
        accessToken: '',
      });

      const inbound = await adapter.handleInbound(payload);
      const metaType = (inbound.metadata as { type?: string })?.type ?? '';

      if (metaType === 'inbound' && inbound.from) {
        await processInboundSms(orgId, 'whatsapp', inbound);
      }
    }

    return reply.status(200).send({ ok: true });
  });

  // ── Compliance (7.5) ──────────────────────────────────────────────────────

  app.get('/api/v1/sms/consents', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { page = 1, limit = 50 } = req.query as { page?: number; limit?: number };
    const consents = await listConsents(orgId, Number(page), Number(limit));
    return { data: consents };
  });

  const consentSchema = z.object({
    phone: z.string().min(5),
    contactId: z.string().uuid().optional(),
    consentSource: z.enum(['web_form', 'sms_keyword', 'api', 'import']),
    consentContext: z.string().optional(),
  });

  app.post('/api/v1/sms/consents', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const data = consentSchema.parse(req.body);
    const consent = await recordConsent(orgId, data.phone, data);
    return reply.status(201).send({ data: consent });
  });

  app.delete(
    '/api/v1/sms/consents/:phone',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const phone = decodeURIComponent((req.params as { phone: string }).phone);
      await revokeConsent(orgId, phone);
      return reply.status(204).send();
    },
  );

  const complianceCheckSchema = z.object({
    phone: z.string().min(5),
    body: z.string().min(1),
    countryCode: z.string().length(2).toUpperCase(),
    requireConsent: z.boolean().default(false),
  });

  app.post('/api/v1/sms/compliance/check', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const data = complianceCheckSchema.parse(req.body);
    const result = await checkSmsCompliance(orgId, data.phone, data.body, data.countryCode, {
      requireConsent: data.requireConsent,
    });
    return { data: result };
  });
}
