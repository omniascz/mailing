/**
 * In-app messaging routes (task 7.11).
 *
 * Auth routes (dashboard):
 *   GET    /api/v1/in-app/messages
 *   POST   /api/v1/in-app/messages
 *   PUT    /api/v1/in-app/messages/:id
 *   DELETE /api/v1/in-app/messages/:id
 *
 * SDK-facing routes (public, API key):
 *   GET    /api/v1/in-app/messages   ?contact_id=&session_id=&page_url=
 *   POST   /api/v1/in-app/track      (impression / click / dismiss events)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listInAppMessages,
  createInAppMessage,
  updateInAppMessage,
  deleteInAppMessage,
  getMatchingMessages,
  checkFrequency,
  trackImpression,
} from '../../services/in-app/index.js';

export default async function inAppRoutes(app: FastifyInstance) {
  // ── Dashboard CRUD (requires JWT auth) ───────────────────────────────────

  app.get('/api/v1/in-app/messages', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { active } = req.query as { active?: string };
    const messages = await listInAppMessages(orgId, active === 'true');
    return { data: messages };
  });

  const targetingRuleSchema = z.object({
    type: z.enum(['page_url', 'segment', 'event', 'custom_field']),
    operator: z.enum(['is', 'contains', 'starts_with', 'in']),
    value: z.union([z.string(), z.array(z.string())]),
  });

  const createSchema = z.object({
    name: z.string().min(1),
    widgetType: z.enum(['banner', 'modal', 'slideout']).default('banner'),
    position: z.enum(['top', 'bottom', 'center', 'left', 'right']).default('bottom'),
    title: z.string().min(1),
    body: z.string().min(1),
    ctaLabel: z.string().optional(),
    ctaUrl: z.string().url().optional(),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#ffffff'),
    textColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#000000'),
    imageUrl: z.string().url().optional(),
    targetingRules: z.array(targetingRuleSchema).default([]),
    maxPerSession: z.number().int().min(0).default(1),
    maxTotal: z.number().int().min(0).default(0),
    autoCloseSeconds: z.number().int().min(0).default(0),
    campaignId: z.string().uuid().optional(),
    startAt: z
      .string()
      .datetime()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
    endAt: z
      .string()
      .datetime()
      .optional()
      .transform((v) => (v ? new Date(v) : undefined)),
  });

  app.post('/api/v1/in-app/messages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { orgId } = req.user as { orgId: string };
    const data = createSchema.parse(req.body);
    const msg = await createInAppMessage(orgId, data as Parameters<typeof createInAppMessage>[1]);
    return reply.status(201).send({ data: msg });
  });

  app.put('/api/v1/in-app/messages/:id', { preHandler: [app.authenticate] }, async (req) => {
    const { orgId } = req.user as { orgId: string };
    const { id } = req.params as { id: string };
    const data = createSchema.partial().parse(req.body);
    const msg = await updateInAppMessage(
      id,
      orgId,
      data as Parameters<typeof updateInAppMessage>[2],
    );
    return { data: msg };
  });

  app.delete(
    '/api/v1/in-app/messages/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { orgId } = req.user as { orgId: string };
      const { id } = req.params as { id: string };
      await deleteInAppMessage(id, orgId);
      return reply.status(204).send();
    },
  );

  // ── SDK-facing: fetch matching messages ───────────────────────────────────
  // This endpoint is called by @forgemsg/web-sdk on every page load.
  // Uses API key auth (X-API-Key header) — no JWT required.

  app.get('/api/v1/in-app/messages/sdk', async (req) => {
    const orgId = (req as { orgId?: string }).orgId ?? '';
    if (!orgId) return { data: [] };

    const { contact_id, session_id, page_url } = req.query as {
      contact_id?: string;
      session_id?: string;
      page_url?: string;
    };

    if (!session_id) return { data: [] };

    const ctx = {
      contactId: contact_id,
      sessionId: session_id,
      pageUrl: page_url,
    };

    const candidates = await getMatchingMessages(orgId, ctx);

    // Apply frequency capping
    const allowed = await Promise.all(
      candidates.map(async (msg) => {
        const ok = await checkFrequency(
          msg.id,
          session_id,
          contact_id,
          msg.maxPerSession,
          msg.maxTotal,
        );
        return ok ? msg : null;
      }),
    );

    return { data: allowed.filter(Boolean) };
  });

  // ── SDK-facing: track impressions ─────────────────────────────────────────

  const trackSchema = z.object({
    messageId: z.string().uuid(),
    sessionId: z.string(),
    eventType: z.enum(['shown', 'clicked', 'dismissed']),
    contactId: z.string().uuid().optional(),
    pageUrl: z.string().optional(),
  });

  app.post('/api/v1/in-app/track', async (req, reply) => {
    const orgId = (req as { orgId?: string }).orgId ?? '';
    if (!orgId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = trackSchema.parse(req.body);
    await trackImpression(
      orgId,
      data.messageId,
      data.sessionId,
      data.eventType,
      data.contactId,
      data.pageUrl,
    );

    return reply.status(204).send();
  });
}
