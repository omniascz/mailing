/**
 * Viber Business Messages routes.
 *
 *   GET    /api/v1/viber/templates               — list org templates
 *   POST   /api/v1/viber/templates               — create template
 *   GET    /api/v1/viber/templates/:id           — get template
 *   PUT    /api/v1/viber/templates/:id           — update template
 *   DELETE /api/v1/viber/templates/:id           — delete template
 *
 *   POST   /api/v1/viber/send                    — send Viber to a contact
 *   POST   /api/v1/viber/campaigns               — create scheduled campaign
 *   GET    /api/v1/viber/campaigns               — list campaigns
 *   POST   /api/v1/viber/campaigns/:id/send      — trigger send now
 *
 *   POST   /webhook/viber/:provider              — delivery status webhook (no auth)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listViberTemplates,
  createViberTemplate,
  updateViberTemplate,
} from '../../services/viber/templates.js';
import { db } from '../../db/client.js';
import { viberTemplates } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { createViberAdapter } from '@forgemsg/shared/viber/adapter';

// ─── Zod schemas ────────────────────────────────────────────────────────────

const viberTypeEnum = z.enum(['text', 'picture', 'video', 'file', 'action']);
const providerEnum = z.enum(['infobip', 'rakuten', 'messagebird']);

const createTemplateBody = z.object({
  name: z.string().min(1).max(100),
  type: viberTypeEnum.default('text'),
  body: z.string().min(1).max(1000),
  mediaUrl: z.string().url().optional(),
  actionUrl: z.string().url().optional(),
  actionText: z.string().max(255).optional(),
  provider: providerEnum.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateTemplateBody = createTemplateBody.partial();

const sendBody = z.object({
  contactId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  /** Inline content — used when no templateId is given */
  body: z.string().max(1000).optional(),
  type: viberTypeEnum.default('text'),
  mediaUrl: z.string().url().optional(),
  actionUrl: z.string().url().optional(),
  actionText: z.string().max(255).optional(),
});

const idParam = z.object({ id: z.string().uuid() });
const providerParam = z.object({ provider: providerEnum });

// ─── Route plugin ────────────────────────────────────────────────────────────

export default async function viberRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  // ── Templates ──────────────────────────────────────────────────────────────

  app.get('/api/v1/viber/templates', auth, async (req, reply) => {
    const data = await listViberTemplates(req.user!.orgId);
    return reply.send({ data });
  });

  app.post('/api/v1/viber/templates', adminAuth, async (req, reply) => {
    const body = createTemplateBody.parse(req.body);
    const row = await createViberTemplate(req.user!.orgId, body);
    return reply.code(201).send({ data: row });
  });

  app.get('/api/v1/viber/templates/:id', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .select()
      .from(viberTemplates)
      .where(and(eq(viberTemplates.orgId, req.user!.orgId), eq(viberTemplates.id, id)));
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
    return reply.send({ data: row });
  });

  app.put('/api/v1/viber/templates/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = updateTemplateBody.parse(req.body);
    const row = await updateViberTemplate(req.user!.orgId, id, body);
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
    return reply.send({ data: row });
  });

  app.delete('/api/v1/viber/templates/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [deleted] = await db
      .delete(viberTemplates)
      .where(and(eq(viberTemplates.orgId, req.user!.orgId), eq(viberTemplates.id, id)))
      .returning();
    if (!deleted) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
    return reply.code(204).send();
  });

  // ── Direct send ────────────────────────────────────────────────────────────

  app.post('/api/v1/viber/send', adminAuth, async (req, reply) => {
    const body = sendBody.parse(req.body);

    // Resolve contact phone
    const { contacts } = await import('../../db/schema/index.js');
    const [contact] = await db
      .select({
        id: contacts.id,
        phone: contacts.phone,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(and(eq(contacts.orgId, req.user!.orgId), eq(contacts.id, body.contactId)));

    if (!contact) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Contact not found' });
    if (!contact.phone) {
      return reply.code(422).send({ code: 'NO_PHONE', message: 'Contact has no phone number' });
    }

    // Resolve content
    let messageBody = body.body ?? '';
    let messageType: 'text' | 'picture' | 'video' | 'file' | 'action' = body.type;
    let mediaUrl = body.mediaUrl;
    let actionUrl = body.actionUrl;
    let actionText = body.actionText;

    if (body.templateId) {
      const [tpl] = await db
        .select()
        .from(viberTemplates)
        .where(
          and(eq(viberTemplates.orgId, req.user!.orgId), eq(viberTemplates.id, body.templateId)),
        );
      if (!tpl) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });
      messageBody = tpl.body;
      messageType = tpl.type as typeof messageType;
      mediaUrl = tpl.mediaUrl ?? undefined;
      actionUrl = tpl.actionUrl ?? undefined;
      actionText = tpl.actionText ?? undefined;
    }

    if (!messageBody) {
      return reply.code(422).send({ code: 'MISSING_BODY', message: 'Message body is required' });
    }

    const adapter = createViberAdapter();
    const result = await adapter.send(
      {
        channel: 'viber',
        orgId: req.user!.orgId,
        content: {
          kind: 'viber',
          type: messageType,
          body: messageBody,
          mediaUrl,
          actionUrl,
          actionText,
        },
      },
      {
        contactId: contact.id,
        phone: contact.phone,
        firstName: contact.firstName ?? undefined,
        lastName: contact.lastName ?? undefined,
      },
    );

    return reply.send({ data: result });
  });

  // ── Delivery status webhook (unauthenticated — called by provider) ─────────

  app.post('/webhook/viber/:provider', async (req, reply) => {
    const { provider } = providerParam.parse(req.params);
    const payload = req.body;

    // Persist DLR asynchronously — don't await to unblock provider quickly
    persistDlr(provider, payload).catch(() => {
      // DLR persistence errors are logged separately — don't fail the 200 OK
    });

    return reply.send({ ok: true });
  });
}

async function persistDlr(_provider: string, payload: unknown): Promise<void> {
  try {
    const adapter = createViberAdapter();
    const inbound = await adapter.handleInbound(payload);
    // Log the DLR — detailed persistence (updating message_events table etc.)
    // is done in the workers/viber processor upon queue completion.
    void inbound;
  } catch {
    // Non-fatal — DLR delivery confirmation is best-effort
  }
}
