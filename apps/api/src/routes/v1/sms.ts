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
import { env } from '../../config/env.js';
import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { checkWebhookSignature, timingSafeEqualString } from '../../lib/webhook-signature.js';
import { verifyMetaRequest } from '../../lib/meta-signature.js';
import { unsignedWebhooksAllowed } from '../../lib/webhook-switches.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { phoneNumbers } from '../../db/schema/phone-numbers.js';

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
    const refusal = twilioSignatureRefusal(req);
    if (refusal) {
      req.log.warn({ code: refusal.code }, 'twilio status callback refused');
      return reply.code(403).send({ code: refusal.code, message: refusal.message });
    }

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
    const refusal = twilioSignatureRefusal(req);
    if (refusal) {
      // 403, not the empty TwiML: an unverifiable request is not a message we
      // chose not to answer. Twilio surfaces it in the console, which is where
      // a misconfigured URL or a rotated token should show up.
      req.log.warn({ code: refusal.code }, 'twilio inbound sms refused');
      return reply.code(403).send({ code: refusal.code, message: refusal.message });
    }

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

    // Whose number this message came to. Was DEFAULT_ORG_ID, with the comment
    // that a real multi-tenant setup would look the number up — which is what
    // this now does.
    const toNumber = payload.To ?? '';
    const orgId = await resolveOrgByInboundNumber(toNumber);
    if (!orgId) {
      req.log.warn(
        { toNumber, messageSid: payload.MessageSid },
        'inbound sms: no active phone number matches this recipient, dropping',
      );
    }

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

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send({ error: 'Forbidden' });
  });

  /** Meta WhatsApp status + inbound webhook */
  app.post('/api/v1/sms/webhooks/whatsapp/inbound', async (req, reply) => {
    // Meta signs the raw bytes with the app secret; the shared helper is the
    // same one routes/v1/webhooks/meta.ts and the ads webhook use, and since
    // #180 an unset secret means not verified rather than verified. The global
    // JSON parser (index.ts:367) keeps req.rawBody for every JSON request, so
    // there is no re-serialised body to mismatch.
    if (!verifyMetaRequest(req, process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET)) {
      req.log.warn('whatsapp inbound webhook refused: invalid or unverifiable signature');
      return reply.code(403).send({ code: 'INVALID_SIGNATURE' });
    }

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

/**
 * The organisation that provisioned the number an inbound message came to.
 *
 * This used to be process.env.DEFAULT_ORG_ID, under a comment saying that a
 * real multi-tenant setup would look the number up. Until it did, every
 * inbound SMS to every provisioned number was processed as if it belonged to
 * one organisation — and processInboundSms does more than store a row: STOP
 * revokes that organisation s SMS consent for the sender, START records it,
 * anything else fires an sms_reply workflow event.
 *
 * phone_numbers is written when a customer provisions the number
 * (routes/v1/phone/numbers.ts:92). Only active rows count: releasing a number
 * gives it back to the provider (:162), and the listing route already filters
 * the same way (:35).
 *
 * Two rows are asked for because the unique key is (org_id, number), which is
 * per organisation — nothing stops two of them from claiming the same number,
 * and handing the message to whichever came back first would be the bug this
 * replaces. No single match means no organisation: nothing is written, and the
 * caller still answers TwiML so Twilio does not retry.
 */
async function resolveOrgByInboundNumber(toNumber: string): Promise<string | null> {
  if (!toNumber) return null;
  // eslint-disable-next-line forgemsgOrg/require-org-scope -- resolves the org
  const matches = await db
    .select({ orgId: phoneNumbers.orgId })
    .from(phoneNumbers)
    .where(and(eq(phoneNumbers.number, toNumber), eq(phoneNumbers.status, 'active')))
    .limit(2);
  return matches.length === 1 ? matches[0]!.orgId : null;
}

/**
 * Twilio's signature, checked the way Twilio documents it.
 *
 * <https://www.twilio.com/docs/usage/security>: take the full URL through the
 * end of the query string; sort the POST parameters alphabetically (Unix-style,
 * case-sensitive); append each name and value to that URL with no delimiters;
 * HMAC-SHA1 the result with the account Auth Token; base64-encode it; compare
 * with the `X-Twilio-Signature` header. Note what is signed: not the body, the
 * URL plus the parameters. A verifier that HMACs the raw body — as
 * services/phone/voip.ts:188 does, uncalled — never matches a real Twilio POST.
 *
 * The URL has to be the one configured in the Twilio console, and this process
 * cannot see it: behind a proxy `req.url` is only the path. API_PUBLIC_URL is
 * the deployment's own statement of its public base, so the URL is rebuilt from
 * it. That makes a wrong API_PUBLIC_URL a reason every genuine callback is
 * refused — which is why the refusal says which of the two causes it was, and
 * why it is logged.
 *
 * A missing Auth Token or a missing public base means NOT VERIFIED, not
 * verified. The only way past that is unsignedWebhooksAllowed(), which cannot
 * be reached in production.
 *
 * Exported for its unit test (sms.test.ts) and called only from this file: the
 * cases where the token or the public base is missing cannot be produced
 * against a running app, because config/env.ts parses once at import.
 */
export function twilioSignatureRefusal(
  req: FastifyRequest,
): { code: string; message: string } | null {
  const base = (env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!base) {
    if (unsignedWebhooksAllowed()) return null;
    return {
      code: 'WEBHOOK_URL_NOT_CONFIGURED',
      message:
        'API_PUBLIC_URL is not set, so the URL Twilio signed cannot be reconstructed and the ' +
        'request cannot be verified. Set it to the public base of this API — the same origin ' +
        'as the webhook URL configured in the Twilio console.',
    };
  }

  // Twilio posts application/x-www-form-urlencoded; @fastify/formbody parses it
  // into a flat object of strings, which is exactly the parameter set to sort.
  const params = (req.body ?? {}) as Record<string, unknown>;
  const canonical = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + String(params[key] ?? ''), `${base}${req.url}`);

  const check = checkWebhookSignature({
    integration: 'Twilio',
    secret: env.TWILIO_AUTH_TOKEN,
    signature: req.headers['x-twilio-signature'] as string | undefined,
    rawBody: canonical,
    verify: (signedString, signature, authToken) =>
      timingSafeEqualString(
        createHmac('sha1', authToken).update(signedString).digest('base64'),
        signature,
      ),
  });

  if (check.ok) return null;
  // The escape hatch covers "we have nothing to verify with", not "this did not
  // verify" — a forged signature is refused in development too.
  if (check.code === 'WEBHOOK_SECRET_NOT_CONFIGURED' && unsignedWebhooksAllowed()) return null;
  return { code: check.code, message: check.message };
}
