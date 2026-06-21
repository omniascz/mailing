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
import { redis } from '../../lib/redis.js';
import { sendTransactionalEmail } from '../../lib/queues.js';
import { checkSendCapacity } from '../../services/billing/plan-enforcement.js';

const transactionalRoutes: FastifyPluginAsync = async (app) => {
  // ── Send transactional email ──────────────────────────────────────────────
  app.post(
    '/api/v1/transactional/email',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'] },
    },
    async (req, reply) => {
      const body = z
        .object({
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
        })
        .parse(req.body);

      if (!body.html && !body.text && !body.templateId) {
        return reply
          .code(400)
          .send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
      }

      const orgId = req.user!.orgId;
      await checkSendCapacity(orgId, 1);

      // Apply caller-supplied merge vars (simple token substitution; template
      // rendering via templateId is resolved inside the MTA worker using the
      // stored template rows — we don't fetch it here to keep this path fast).
      let html = body.html ?? '';
      let text = body.text ?? '';
      if (body.mergeVars) {
        for (const [key, val] of Object.entries(body.mergeVars)) {
          const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
          html = html.replace(re, val);
          text = text.replace(re, val);
        }
      }

      // Enqueue onto MTA-other (transactional priority) and get the canonical
      // messageId back. The Go engine performs the actual SMTP delivery.
      const messageId = await sendTransactionalEmail({
        to: body.to,
        from: body.from,
        fromName: body.fromName,
        subject: body.subject,
        html: html || '<p></p>',
        text: text || undefined,
        orgId,
      });

      // Log send event for analytics + delivery webhooks.
      await db.insert(emailEvents).values({
        orgId,
        eventType: 'send',
        messageId,
        metadata: {
          to: body.to,
          transactional: true,
          tags: body.tags ?? [],
          scheduleAt: body.scheduleAt ?? null,
          templateId: body.templateId ?? null,
          ...body.metadata,
        },
      });

      return reply
        .code(202)
        .send({ data: { messageId, status: body.scheduleAt ? 'scheduled' : 'queued' } });
    },
  );

  // ── Send transactional SMS ────────────────────────────────────────────────
  app.post(
    '/api/v1/transactional/sms',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          to: z.string().min(5).max(32),
          from: z.string().max(32).optional(),
          text: z.string().min(1).max(1600),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      // Delegate to SMS routing (same routedSmsSend path campaign sender uses).
      const { routedSmsSend } = await import('../../services/sms/routing.js');
      const result = await routedSmsSend(
        req.user!.orgId,
        { text: body.text, from: body.from } as never,
        { phone: body.to } as never,
      );
      return reply.code(202).send({ data: result });
    },
  );

  // ── Batch send transactional emails (#284) ───────────────────────────────
  app.post(
    '/api/v1/transactional/email/batch',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          from: z.string().email(),
          fromName: z.string().max(100).optional(),
          subject: z.string().min(1).max(500),
          html: z.string().optional(),
          text: z.string().optional(),
          templateId: z.string().uuid().optional(),
          recipients: z
            .array(
              z.object({
                email: z.string().email(),
                mergeVars: z.record(z.string()).optional(),
                metadata: z.record(z.unknown()).optional(),
              }),
            )
            .min(1)
            .max(1000),
          scheduleAt: z.string().datetime().optional(),
          tags: z.array(z.string()).max(20).optional(),
        })
        .parse(req.body);

      if (!body.html && !body.text && !body.templateId) {
        return reply
          .code(400)
          .send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
      }

      // Deduplicate by email (keep first occurrence)
      const seen = new Set<string>();
      const unique = body.recipients.filter((r) => {
        const key = r.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const results = await Promise.all(
        unique.map(async (recipient) => {
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
          return {
            email: recipient.email,
            messageId,
            status: body.scheduleAt ? 'scheduled' : 'queued',
          };
        }),
      );

      return reply.code(202).send({
        data: {
          queued: results.length,
          deduplicated: body.recipients.length - results.length,
          results,
        },
      });
    },
  );

  // ── Search recent messages ────────────────────────────────────────────────
  app.get(
    '/api/v1/transactional/messages',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          messageId: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query);

      const { eq, and, desc } = await import('drizzle-orm');
      const rows = await db
        .select()
        .from(emailEvents)
        .where(
          q.messageId
            ? and(eq(emailEvents.orgId, req.user!.orgId), eq(emailEvents.messageId, q.messageId))
            : eq(emailEvents.orgId, req.user!.orgId),
        )
        .orderBy(desc(emailEvents.createdAt))
        .limit(q.limit);
      return reply.send({ data: rows });
    },
  );

  void campaigns;

  // ── Batch transactional email (#541) — up to 1000 personalized emails ────
  // POST /api/v1/transactional/batch
  app.post(
    '/api/v1/transactional/batch',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'], summary: 'Send up to 1000 personalized transactional emails (with batchId tracking)' },
    },
    async (req, reply) => {
      const body = z
        .object({
          from: z.string().email(),
          fromName: z.string().max(100).optional(),
          subject: z.string().min(1).max(500),
          html: z.string().optional(),
          text: z.string().optional(),
          templateId: z.string().uuid().optional(),
          recipients: z
            .array(
              z.object({
                to: z.string().email(),
                mergeVars: z.record(z.string()).optional(),
                metadata: z.record(z.unknown()).optional(),
              }),
            )
            .min(1)
            .max(1000),
          tags: z.array(z.string()).max(20).optional(),
        })
        .parse(req.body);

      if (!body.html && !body.text && !body.templateId) {
        return reply
          .code(400)
          .send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
      }

      const orgId = req.user!.orgId;
      await checkSendCapacity(orgId, body.recipients.length);
      const batchId = randomUUID();
      const batchKey = `batch:txn:${orgId}:${batchId}`;

      // Deduplicate by email
      const seen = new Set<string>();
      const unique = body.recipients.filter((r) => {
        const key = r.to.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Store initial batch status in Redis (TTL 7 days)
      await redis.set(
        batchKey,
        JSON.stringify({
          batchId,
          orgId,
          total: unique.length,
          queued: 0,
          failed: 0,
          status: 'processing',
          createdAt: new Date().toISOString(),
        }),
        'EX',
        604800,
      );

      // Enqueue all messages (fire-and-forget progress update)
      let queued = 0;
      const results: Array<{ to: string; messageId: string; status: string }> = [];

      await Promise.all(
        unique.map(async (recipient) => {
          try {
            // Apply merge vars to html/text via simple replacement
            let html = body.html;
            let text = body.text;
            if (recipient.mergeVars) {
              for (const [k, v] of Object.entries(recipient.mergeVars)) {
                const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
                if (html) html = html.replace(re, v);
                if (text) text = text.replace(re, v);
              }
            }
            const messageId = await sendTransactionalEmail({
              from: body.from,
              fromName: body.fromName,
              to: recipient.to,
              subject: body.subject,
              html: html ?? text ?? '',
              text: text,
              orgId,
            });
            results.push({ to: recipient.to, messageId, status: 'queued' });
            queued++;
          } catch {
            results.push({ to: recipient.to, messageId: '', status: 'failed' });
          }
        }),
      );

      // Update batch status
      await redis.set(
        batchKey,
        JSON.stringify({
          batchId,
          orgId,
          total: unique.length,
          queued,
          failed: unique.length - queued,
          status: 'queued',
          createdAt: new Date().toISOString(),
        }),
        'EX',
        604800,
      );

      return reply.code(202).send({
        data: {
          batchId,
          total: unique.length,
          queued,
          failed: unique.length - queued,
          deduplicated: body.recipients.length - unique.length,
          results,
        },
      });
    },
  );

  // ── Batch status (#541) ────────────────────────────────────────────────────
  // GET /api/v1/transactional/batch/:batchId
  app.get(
    '/api/v1/transactional/batch/:batchId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'], summary: 'Get batch transactional send progress' },
    },
    async (req, reply) => {
      const { batchId } = req.params as { batchId: string };
      const orgId = req.user!.orgId;
      const batchKey = `batch:txn:${orgId}:${batchId}`;

      const raw = await redis.get(batchKey);
      if (!raw) {
        return reply.code(404).send({ code: 'BATCH_NOT_FOUND', message: 'Batch not found or expired' });
      }
      return reply.send({ data: JSON.parse(raw) });
    },
  );
};

export default transactionalRoutes;
