/**
 * WhatsApp API routes (tasks 7.7–7.9).
 *
 * Template management (7.7):
 *   GET    /api/v1/whatsapp/templates
 *   POST   /api/v1/whatsapp/templates
 *   PUT    /api/v1/whatsapp/templates/:id
 *   DELETE /api/v1/whatsapp/templates/:id
 *   POST   /api/v1/whatsapp/templates/:id/submit
 *
 * Rich messaging (7.8):
 *   POST   /api/v1/whatsapp/send/media
 *   POST   /api/v1/whatsapp/send/button
 *   POST   /api/v1/whatsapp/send/list
 *   POST   /api/v1/whatsapp/send/location
 *
 * Compliance + quality (7.9):
 *   GET    /api/v1/whatsapp/consents
 *   POST   /api/v1/whatsapp/consents
 *   DELETE /api/v1/whatsapp/consents/:phone
 *   GET    /api/v1/whatsapp/phone-numbers
 *   POST   /api/v1/whatsapp/phone-numbers
 *   POST   /api/v1/whatsapp/webhooks/meta        (Meta webhook: quality + template status)
 *   GET    /api/v1/whatsapp/webhooks/meta         (Meta challenge verification)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listWaTemplates,
  createWaTemplate,
  updateWaTemplate,
  deleteWaTemplate,
  submitWaTemplateForApproval,
  syncWaTemplateStatus,
} from '../../services/whatsapp/templates.js';
import {
  RichWhatsAppSender,
  handleInteractiveReply,
} from '../../services/whatsapp/rich-messaging.js';
import {
  recordWaConsent,
  revokeWaConsent,
  updateQualityRating,
  updateMessagingLimitTier,
  upsertWaPhoneNumber,
} from '../../services/whatsapp/compliance.js';

import { db } from '../../db/client.js';
import { whatsappConsents, whatsappPhoneNumbers } from '../../db/schema/whatsapp.js';
import { eq } from 'drizzle-orm';
import { verifyMetaRequest } from '../../lib/meta-signature.js';

export default async function whatsappRoutes(app: FastifyInstance) {
  // ── Template management ───────────────────────────────────────────────────

  app.get('/api/v1/whatsapp/templates', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { status } = req.query as { status?: string };
    const templates = await listWaTemplates(orgId, status);
    return { data: templates };
  });

  const templateComponentSchema = z.object({
    type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
    format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
    text: z.string().optional(),
    buttons: z
      .array(
        z.object({
          type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
          text: z.string().max(25),
          url: z.string().optional(),
          phone_number: z.string().optional(),
        }),
      )
      .optional(),
  });

  const createTemplateSchema = z.object({
    name: z.string().min(1).max(512),
    category: z.enum(['marketing', 'utility', 'authentication']).default('utility'),
    language: z.string().default('en_US'),
    components: z.array(templateComponentSchema).min(1),
  });

  app.post('/api/v1/whatsapp/templates', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const data = createTemplateSchema.parse(req.body);
    const template = await createWaTemplate(orgId, data);
    return reply.status(201).send({ data: template });
  });

  app.put('/api/v1/whatsapp/templates/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { id } = req.params as { id: string };
    const data = createTemplateSchema.partial().parse(req.body);
    const template = await updateWaTemplate(
      id,
      orgId,
      data as Parameters<typeof updateWaTemplate>[2],
    );
    return { data: template };
  });

  app.delete(
    '/api/v1/whatsapp/templates/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const { id } = req.params as { id: string };
      await deleteWaTemplate(id, orgId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/api/v1/whatsapp/templates/:id/submit',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { orgId } = req.user as { orgId: string };
      const { id } = req.params as { id: string };
      const { accessToken, wabaId } = req.body as { accessToken: string; wabaId: string };

      const template = await submitWaTemplateForApproval(id, orgId, accessToken, wabaId);
      return { data: template };
    },
  );

  // ── Rich messaging ────────────────────────────────────────────────────────

  function getWaSender(body: { phoneNumberId: string; accessToken: string }) {
    return new RichWhatsAppSender({
      phoneNumberId: body.phoneNumberId,
      accessToken: body.accessToken,
    });
  }

  app.post('/api/v1/whatsapp/send/media', { preHandler: [app.authenticate] }, async (req) => {
    const { recipient, media, phoneNumberId, accessToken } = req.body as {
      recipient: { contactId: string; phone: string };
      media: { type: string; link?: string; id?: string; caption?: string; filename?: string };
      phoneNumberId: string;
      accessToken: string;
    };

    const sender = getWaSender({ phoneNumberId, accessToken });
    const result = await sender.sendMedia(
      recipient,
      media as Parameters<typeof sender.sendMedia>[1],
    );
    return { data: result };
  });

  app.post('/api/v1/whatsapp/send/button', { preHandler: [app.authenticate] }, async (req) => {
    const { recipient, message, phoneNumberId, accessToken } = req.body as {
      recipient: { contactId: string; phone: string };
      message: Parameters<typeof RichWhatsAppSender.prototype.sendButton>[1];
      phoneNumberId: string;
      accessToken: string;
    };

    const sender = getWaSender({ phoneNumberId, accessToken });
    const result = await sender.sendButton(recipient, message);
    return { data: result };
  });

  app.post('/api/v1/whatsapp/send/list', { preHandler: [app.authenticate] }, async (req) => {
    const { recipient, message, phoneNumberId, accessToken } = req.body as {
      recipient: { contactId: string; phone: string };
      message: Parameters<typeof RichWhatsAppSender.prototype.sendList>[1];
      phoneNumberId: string;
      accessToken: string;
    };

    const sender = getWaSender({ phoneNumberId, accessToken });
    const result = await sender.sendList(recipient, message);
    return { data: result };
  });

  app.post('/api/v1/whatsapp/send/location', { preHandler: [app.authenticate] }, async (req) => {
    const { recipient, location, phoneNumberId, accessToken } = req.body as {
      recipient: { contactId: string; phone: string };
      location: Parameters<typeof RichWhatsAppSender.prototype.sendLocation>[1];
      phoneNumberId: string;
      accessToken: string;
    };

    const sender = getWaSender({ phoneNumberId, accessToken });
    const result = await sender.sendLocation(recipient, location);
    return { data: result };
  });

  // ── Compliance (7.9) ──────────────────────────────────────────────────────

  app.get('/api/v1/whatsapp/consents', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const consents = await db
      .select()
      .from(whatsappConsents)
      .where(eq(whatsappConsents.orgId, orgId));
    return { data: consents };
  });

  app.post('/api/v1/whatsapp/consents', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const { phone, contactId, consentSource, consentContext } = req.body as {
      phone: string;
      contactId?: string;
      consentSource: string;
      consentContext?: string;
    };
    const consent = await recordWaConsent(orgId, phone, {
      contactId,
      consentSource,
      consentContext,
    });
    return reply.status(201).send({ data: consent });
  });

  app.delete(
    '/api/v1/whatsapp/consents/:phone',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const phone = decodeURIComponent((req.params as { phone: string }).phone);
      await revokeWaConsent(orgId, phone);
      return reply.status(204).send();
    },
  );

  // Phone numbers management
  app.get('/api/v1/whatsapp/phone-numbers', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const numbers = await db
      .select()
      .from(whatsappPhoneNumbers)
      .where(eq(whatsappPhoneNumbers.orgId, orgId));
    return { data: numbers };
  });

  app.post(
    '/api/v1/whatsapp/phone-numbers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const { phoneNumberId, displayPhone } = req.body as {
        phoneNumberId: string;
        displayPhone?: string;
      };
      const number = await upsertWaPhoneNumber(orgId, phoneNumberId, displayPhone);
      return reply.status(201).send({ data: number });
    },
  );

  // ── Meta webhook ──────────────────────────────────────────────────────────

  /** Meta webhook verification */
  app.get('/api/v1/whatsapp/webhooks/meta', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN ?? '')) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send({ error: 'Forbidden' });
  });

  /** Meta webhook handler — receives quality_update, account_update, template_status_update */
  app.post('/api/v1/whatsapp/webhooks/meta', async (req, reply) => {
    // Verify Meta's X-Hub-Signature-256 over the raw body before trusting any
    // inbound message / template-status event.
    if (!verifyMetaRequest(req, process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET)) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }
    const payload = req.body as Record<string, unknown>;
    const orgId = process.env.DEFAULT_ORG_ID ?? '';

    try {
      const entries = (payload.entry as Array<Record<string, unknown>>) ?? [];

      for (const entry of entries) {
        const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];

        for (const change of changes) {
          const value = change.value as Record<string, unknown>;
          const field = change.field as string;

          // Template status update
          if (field === 'message_template_status_update') {
            const { message_template_name, message_template_language, event, reason } = value as {
              message_template_name: string;
              message_template_language: string;
              event: string;
              reason?: string;
            };

            if (orgId) {
              await syncWaTemplateStatus(
                orgId,
                message_template_name,
                message_template_language,
                event,
                reason,
              );
            }
          }

          // Quality rating update
          if (field === 'quality_update' || field === 'phone_number_quality_update') {
            const { display_phone_number_id, current_rating } = value as {
              display_phone_number_id: string;
              current_rating: 'GREEN' | 'YELLOW' | 'RED';
            };

            if (orgId && display_phone_number_id) {
              await updateQualityRating(
                orgId,
                display_phone_number_id,
                current_rating ?? 'UNKNOWN',
              );
            }
          }

          // Account update (tier change)
          if (field === 'account_update') {
            const { phone_number_id, messaging_limit_tier } = value as {
              phone_number_id: string;
              messaging_limit_tier: string;
            };

            if (orgId && phone_number_id && messaging_limit_tier) {
              await updateMessagingLimitTier(orgId, phone_number_id, messaging_limit_tier);
            }
          }

          // Interactive reply tracking
          if (field === 'messages') {
            const messages = (value.messages as Array<Record<string, unknown>>) ?? [];

            for (const msg of messages) {
              const interactive = msg.interactive as Record<string, unknown> | undefined;

              if (interactive) {
                const replyType = interactive.type as string;
                const replyData = (interactive[replyType] ?? {}) as Record<string, string>;
                const from = msg.from as string;
                const contactId = (msg as Record<string, unknown>).contact_id as string | undefined;

                if (orgId && contactId) {
                  await handleInteractiveReply(orgId, contactId, {
                    type: replyType === 'button_reply' ? 'button_reply' : 'list_reply',
                    buttonId: replyData.id,
                    listId: replyData.id,
                    title: replyData.title ?? '',
                    contactPhone: `+${from}`,
                    messageId: (msg.id as string) ?? '',
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      app.log.error(err, 'WhatsApp webhook error');
    }

    return reply.status(200).send({ ok: true });
  });

  // ── WhatsApp Catalog Messages ─────────────────────────────────────────────

  /**
   * POST /api/v1/whatsapp/send/catalog
   * Send a product catalog message (requires WhatsApp Business Account with catalog).
   */
  app.post(
    '/api/v1/whatsapp/send/catalog',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = z.object({
        phoneNumberId: z.string().min(1),
        to: z.string().min(5),
        bodyText: z.string().min(1).max(1024),
        footerText: z.string().max(60).optional(),
        /** WhatsApp Business catalog ID */
        catalogId: z.string().min(1),
        /** Optional single product ID to highlight */
        productRetailerId: z.string().optional(),
        /** For multi-product messages: sections with products */
        sections: z.array(z.object({
          title: z.string().max(24),
          productItems: z.array(z.object({ productRetailerId: z.string() })).max(30),
        })).max(10).optional(),
      }).parse(req.body);

      const token = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
      const metaApiVersion = process.env.META_API_VERSION ?? 'v18.0';

      let interactivePayload: Record<string, unknown>;
      if (body.productRetailerId && !body.sections) {
        // Single product message
        interactivePayload = {
          type: 'product',
          body: { text: body.bodyText },
          ...(body.footerText ? { footer: { text: body.footerText } } : {}),
          action: { catalog_id: body.catalogId, product_retailer_id: body.productRetailerId },
        };
      } else {
        // Multi-product message
        interactivePayload = {
          type: 'product_list',
          header: { type: 'text', text: body.bodyText.slice(0, 60) },
          body: { text: body.bodyText },
          ...(body.footerText ? { footer: { text: body.footerText } } : {}),
          action: {
            catalog_id: body.catalogId,
            sections: (body.sections ?? []).map((s) => ({
              title: s.title,
              product_items: s.productItems.map((p) => ({ product_retailer_id: p.productRetailerId })),
            })),
          },
        };
      }

      const resp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/${body.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: body.to, type: 'interactive', interactive: interactivePayload }),
        },
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as Record<string, unknown>;
        return reply.status(resp.status).send({ code: 'META_API_ERROR', detail: err });
      }

      const result = await resp.json() as Record<string, unknown>;
      return reply.send({ data: { messageId: (result['messages'] as Array<Record<string, string>>)?.[0]?.id } });
    },
  );

  // ── WhatsApp Flows ────────────────────────────────────────────────────────

  /**
   * POST /api/v1/whatsapp/flows
   * Create a new WhatsApp Flow via Meta Flows API.
   */
  app.post('/api/v1/whatsapp/flows', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({
      wabaId: z.string().min(1),
      name: z.string().min(1).max(100),
      categories: z.array(z.enum(['SIGN_UP', 'SIGN_IN', 'APPOINTMENT_BOOKING', 'LEAD_GENERATION', 'CONTACT_US', 'CUSTOMER_SUPPORT', 'SURVEY', 'OTHER'])).min(1),
    }).parse(req.body);

    const token = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
    const metaApiVersion = process.env.META_API_VERSION ?? 'v18.0';

    const resp = await fetch(`https://graph.facebook.com/${metaApiVersion}/${body.wabaId}/flows`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name, categories: body.categories }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as Record<string, unknown>;
      return reply.status(resp.status).send({ code: 'META_API_ERROR', detail: err });
    }

    return reply.status(201).send({ data: await resp.json() });
  });

  /**
   * POST /api/v1/whatsapp/flows/:flowId/send
   * Send a WhatsApp Flow to a contact via interactive flow message.
   */
  app.post(
    '/api/v1/whatsapp/flows/:flowId/send',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { flowId } = req.params as { flowId: string };
      const body = z.object({
        phoneNumberId: z.string().min(1),
        to: z.string().min(5),
        headerText: z.string().max(60),
        bodyText: z.string().max(1024),
        footerText: z.string().max(60).optional(),
        ctaButtonText: z.string().max(20).default('Open'),
        flowToken: z.string().optional().default('unused'),
        mode: z.enum(['draft', 'published']).optional().default('published'),
      }).parse(req.body);

      const token = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
      const metaApiVersion = process.env.META_API_VERSION ?? 'v18.0';

      const interactive = {
        type: 'flow',
        header: { type: 'text', text: body.headerText },
        body: { text: body.bodyText },
        ...(body.footerText ? { footer: { text: body.footerText } } : {}),
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: body.flowToken,
            flow_id: flowId,
            flow_cta: body.ctaButtonText,
            flow_action: 'navigate',
            mode: body.mode,
          },
        },
      };

      const resp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/${body.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: body.to, type: 'interactive', interactive }),
        },
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as Record<string, unknown>;
        return reply.status(resp.status).send({ code: 'META_API_ERROR', detail: err });
      }

      const result = await resp.json() as Record<string, unknown>;
      return reply.send({ data: { messageId: (result['messages'] as Array<Record<string, string>>)?.[0]?.id } });
    },
  );
}
