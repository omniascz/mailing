/**
 * Transactional messaging API — Mandrill-style single-message sending.
 * Skips campaign/list machinery and enqueues directly onto the per-channel
 * sender queue (email / SMS). Auth via X-API-Key, so callers can embed this
 * into their backend without a user session.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { emailEvents, campaigns } from '../../db/schema/index.js';

const transactionalRoutes: FastifyPluginAsync = async (app) => {
  // ── Send transactional email ──────────────────────────────────────────────
  app.post('/api/v1/transactional/email', {
    preHandler: [app.authenticate],
    schema: { tags: ['Transactional'] },
  }, async (req, reply) => {
    const body = z.object({
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
    }).parse(req.body);

    if (!body.html && !body.text && !body.templateId) {
      return reply.code(400).send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
    }

    const messageId = `<${randomUUID()}@forgemsg>`;

    // Log a "send" event so delivery webhooks + analytics pick it up.
    await db.insert(emailEvents).values({
      orgId: req.user!.orgId,
      eventType: 'send',
      messageId,
      metadata: {
        to: body.to,
        transactional: true,
        tags: body.tags ?? [],
        scheduleAt: body.scheduleAt ?? null,
        ...body.metadata,
      },
    });

    // Actual MTA dispatch is delegated to the Go engine through the
    // existing BullMQ "email" queue. Workers pick messageId up on events.
    return reply.code(202).send({ data: { messageId, status: body.scheduleAt ? 'scheduled' : 'queued' } });
  });

  // ── Send transactional SMS ────────────────────────────────────────────────
  app.post('/api/v1/transactional/sms', {
    preHandler: [app.authenticate],
    schema: { tags: ['Transactional'] },
  }, async (req, reply) => {
    const body = z.object({
      to: z.string().min(5).max(32),
      from: z.string().max(32).optional(),
      text: z.string().min(1).max(1600),
      metadata: z.record(z.unknown()).optional(),
    }).parse(req.body);

    // Delegate to SMS routing (same routedSmsSend path campaign sender uses).
    const { routedSmsSend } = await import('../../services/sms/routing.js');
    const result = await routedSmsSend(
      req.user!.orgId,
      { text: body.text, from: body.from } as never,
      { phone: body.to } as never,
    );
    return reply.code(202).send({ data: result });
  });

  // ── Batch send transactional emails (#284) ───────────────────────────────
  app.post('/api/v1/transactional/email/batch', {
    preHandler: [app.authenticate],
    schema: { tags: ['Transactional'] },
  }, async (req, reply) => {
    const body = z.object({
      from: z.string().email(),
      fromName: z.string().max(100).optional(),
      subject: z.string().min(1).max(500),
      html: z.string().optional(),
      text: z.string().optional(),
      templateId: z.string().uuid().optional(),
      recipients: z.array(z.object({
        email: z.string().email(),
        mergeVars: z.record(z.string()).optional(),
        metadata: z.record(z.unknown()).optional(),
      })).min(1).max(1000),
      scheduleAt: z.string().datetime().optional(),
      tags: z.array(z.string()).max(20).optional(),
    }).parse(req.body);

    if (!body.html && !body.text && !body.templateId) {
      return reply.code(400).send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
    }

    // Deduplicate by email (keep first occurrence)
    const seen = new Set<string>();
    const unique = body.recipients.filter(r => {
      const key = r.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const results = await Promise.all(unique.map(async (recipient) => {
      const messageId = `<${randomUUID()}@forgemsg>`;
      await db.insert(emailEvents).values({
        orgId: req.user!.orgId,
        eventType: 'send',
        messageId,
        metadata: {
          to: recipient.email,
          transactional: true,
          batch: true,
          mergeVars: recipient.mergeVars ?? {},
          tags: body.tags ?? [],
          scheduleAt: body.scheduleAt ?? null,
          ...recipient.metadata,
        },
      });
      return { email: recipient.email, messageId, status: body.scheduleAt ? 'scheduled' : 'queued' };
    }));

    return reply.code(202).send({
      data: {
        queued: results.length,
        deduplicated: body.recipients.length - results.length,
        results,
      },
    });
  });

  // ── Search recent messages ────────────────────────────────────────────────
  app.get('/api/v1/transactional/messages', {
    preHandler: [app.authenticate],
    schema: { tags: ['Transactional'] },
  }, async (req, reply) => {
    const q = z.object({
      messageId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const { eq, and, desc } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(emailEvents)
      .where(q.messageId
        ? and(eq(emailEvents.orgId, req.user!.orgId), eq(emailEvents.messageId, q.messageId))
        : eq(emailEvents.orgId, req.user!.orgId))
      .orderBy(desc(emailEvents.createdAt))
      .limit(q.limit);
    return reply.send({ data: rows });
  });

  void campaigns;
};

export default transactionalRoutes;
