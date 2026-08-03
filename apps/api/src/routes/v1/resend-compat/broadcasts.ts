/**
 * Resend-compatible Broadcasts API.
 *
 * Maps Resend's `/broadcasts` (one-shot newsletters to an audience) onto
 * MailForge's `campaigns` model. Each Resend Broadcast becomes a
 * MailForge Campaign with `type='email'` and a `listId` (the audience).
 *
 * The richer MailForge campaign features (A/B, segments, automation
 * triggers, drag-drop editor) sit on top of the same row, so a customer
 * starting with Resend Broadcasts can grow into our full marketing
 * surface without migrating data.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { campaigns, type Campaign } from '../../../db/schema/index.js';
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  scheduleCampaign,
  sendCampaign,
  updateCampaign,
} from '../../../services/campaigns/index.js';

function broadcastShape(c: Campaign) {
  return {
    object: 'broadcast' as const,
    id: c.id,
    audience_id: c.listId,
    from: c.fromEmail,
    subject: c.subject ?? '',
    reply_to: c.replyTo ? [c.replyTo] : [],
    preview_text: c.preheader ?? '',
    status: mapStatus(c.status),
    created_at: c.createdAt.toISOString(),
    scheduled_at: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    sent_at: c.sentAt ? c.sentAt.toISOString() : null,
  };
}

function mapStatus(s: string): string {
  // MailForge campaign statuses: draft, scheduled, sending, sent, paused…
  // Resend broadcast statuses: draft, queued, sent.
  if (s === 'draft') return 'draft';
  if (s === 'scheduled') return 'queued';
  if (s === 'sent' || s === 'sending') return 'sent';
  return s;
}

function extractHtml(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const o = content as Record<string, unknown>;
    if (typeof o.html === 'string') return o.html;
    if (typeof o.body === 'string') return o.body;
  }
  return '';
}

const broadcastsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/broadcasts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'List broadcasts' },
    },
    async (req, reply) => {
      const result = await listCampaigns({ orgId: req.user!.orgId, limit: 100 });
      const rows = (result as { data?: Campaign[] }).data ?? (result as unknown as Campaign[]);
      return reply.send({ data: rows.map(broadcastShape) });
    },
  );

  app.post(
    '/api/v1/broadcasts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Create a broadcast' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          audience_id: z.string().uuid(),
          from: z.string().email(),
          subject: z.string().min(1).max(255),
          reply_to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
          preview_text: z.string().max(255).optional(),
          html: z.string().optional(),
          text: z.string().optional(),
          scheduled_at: z.string().datetime().optional(),
        })
        .safeParse(req.body);

      if (!body.success) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: body.error.issues.map((i) => i.message).join('; '),
        });
      }
      if (!body.data.html && !body.data.text) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: 'Provide either html or text for the broadcast body',
        });
      }

      const replyTo = Array.isArray(body.data.reply_to)
        ? body.data.reply_to[0]
        : body.data.reply_to;

      const broadcast = await createCampaign({
        orgId: req.user!.orgId,
        name: body.data.name ?? body.data.subject,
        type: 'email',
        subject: body.data.subject,
        preheader: body.data.preview_text,
        fromEmail: body.data.from,
        replyTo,
        listId: body.data.audience_id,
        content: {
          html: body.data.html ?? '',
          text: body.data.text ?? '',
          source: 'resend-broadcast',
        },
        scheduledAt: body.data.scheduled_at ? new Date(body.data.scheduled_at) : undefined,
      });

      // If scheduled, also flip status via scheduleCampaign so the worker
      // picks it up.
      if (body.data.scheduled_at) {
        await scheduleCampaign(req.user!.orgId, broadcast.id, new Date(body.data.scheduled_at));
      }

      const fresh = await getCampaign(req.user!.orgId, broadcast.id);
      return reply.code(200).send(broadcastShape(fresh));
    },
  );

  app.get(
    '/api/v1/broadcasts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Retrieve a broadcast' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const c = await getCampaign(req.user!.orgId, id).catch(() => null);
      if (!c)
        return reply
          .code(404)
          .send({ statusCode: 404, name: 'not_found', message: `Broadcast ${id} not found` });
      return reply.send(broadcastShape(c));
    },
  );

  app.patch(
    '/api/v1/broadcasts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Update a broadcast' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          subject: z.string().min(1).max(255).optional(),
          from: z.string().email().optional(),
          reply_to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
          preview_text: z.string().max(255).optional(),
          html: z.string().optional(),
          text: z.string().optional(),
          scheduled_at: z.string().datetime().nullable().optional(),
        })
        .parse(req.body);

      const patch: Parameters<typeof updateCampaign>[2] = {};
      if (body.subject !== undefined) patch.subject = body.subject;
      if (body.from !== undefined) patch.fromEmail = body.from;
      if (body.reply_to !== undefined) {
        patch.replyTo = Array.isArray(body.reply_to) ? body.reply_to[0] : body.reply_to;
      }
      if (body.preview_text !== undefined) patch.preheader = body.preview_text;
      if (body.html !== undefined || body.text !== undefined) {
        patch.content = {
          html: body.html ?? '',
          text: body.text ?? '',
          source: 'resend-broadcast',
        };
      }
      if (body.scheduled_at !== undefined) {
        patch.scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : undefined;
      }

      const updated = await updateCampaign(req.user!.orgId, id, patch);
      return reply.send(broadcastShape(updated));
    },
  );

  app.delete(
    '/api/v1/broadcasts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Delete a broadcast' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteCampaign(req.user!.orgId, id).catch(() => null);
      return reply.send({ object: 'broadcast', id, deleted: true });
    },
  );

  app.post(
    '/api/v1/broadcasts/:id/send',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Send a broadcast' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({ scheduled_at: z.string().datetime().optional() })
        .parse(req.body ?? {});

      if (body.scheduled_at) {
        await scheduleCampaign(req.user!.orgId, id, new Date(body.scheduled_at));
      } else {
        await sendCampaign(req.user!.orgId, id);
      }
      const fresh = await getCampaign(req.user!.orgId, id);
      return reply.send(broadcastShape(fresh));
    },
  );

  void campaigns;
  void db;
  void extractHtml;
  void eq;
};

export default broadcastsRoutes;
