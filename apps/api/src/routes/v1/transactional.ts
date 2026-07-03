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
import { and, eq, gte, lte } from 'drizzle-orm';

const transactionalRoutes: FastifyPluginAsync = async (app) => {
  // ── Send transactional email ──────────────────────────────────────────────
  app.post(
    '/api/v1/transactional/email',
    {
      preHandler: [app.authenticate, app.requireScope('emails:send')],
      schema: { tags: ['Transactional'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          to: z.string().email(),
          from: z.string().email(),
          fromName: z.string().max(100).optional(),
          replyTo: z.string().email().optional(),
          // Optional when templateId supplies the subject.
          subject: z.string().max(500).optional(),
          html: z.string().optional(),
          text: z.string().optional(),
          templateId: z.string().uuid().optional(),
          mergeVars: z.record(z.string()).optional(),
          /** Extra RFC5322 headers (SendGrid `headers`). */
          headers: z.record(z.string()).optional(),
          /** SendGrid `custom_args` — opaque key/values echoed in events. */
          customArgs: z.record(z.string()).optional(),
          scheduleAt: z.string().datetime().optional(),
          metadata: z.record(z.unknown()).optional(),
          tags: z.array(z.string()).max(20).optional(),
          /** Per-request sandbox: validate + record but never dispatch (SendGrid mail_settings.sandbox_mode). */
          sandboxMode: z.boolean().optional(),
          /** Configuration set name — applies its options + sending gate. */
          configurationSet: z.string().max(128).optional(),
          // File attachments (e-ticket PDFs etc.). Omit for link-only delivery.
          // contentBase64 capped at ~14 MB chars (~10 MB raw) to stay under the
          // engine's 16 MB gRPC message limit.
          attachments: z
            .array(
              z.object({
                filename: z.string().min(1).max(255),
                contentType: z.string().min(1).max(128),
                contentBase64: z.string().min(1).max(14_000_000),
                contentId: z.string().max(128).optional(),
                inline: z.boolean().optional(),
              }),
            )
            .max(10)
            .optional(),
        })
        .parse(req.body);

      if (!body.html && !body.text && !body.templateId) {
        return reply
          .code(400)
          .send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
      }

      const orgId = req.user!.orgId;
      const testMode = req.user?.apiKeyMode === 'test' || body.sandboxMode === true;
      if (!testMode) {
        await checkSendCapacity(orgId, 1);
        const { enforceSendRate } = await import('../../services/sending/send-rate.js');
        await enforceSendRate(orgId, 1);
      }

      // Apply the configuration set (throws 403 if the set's sending is paused).
      const { applyConfigurationSet } = await import('../../services/configuration-sets/index.js');
      const cfgSet = await applyConfigurationSet(orgId, body.configurationSet);
      // Resolve the config set's IP pool → sending IP for this send.
      let sendingIp = '';
      if (cfgSet.ipPoolId) {
        const { pickIpForSend } = await import('../../services/dedicated-ips/index.js');
        const ip = await pickIpForSend(orgId, cfgSet.ipPoolId).catch(() => null);
        sendingIp = ip?.ipAddress ?? '';
      }

      // Sandbox gate: unverified accounts may only send to verified recipients.
      if (!testMode) {
        const { assertSandboxSendAllowed } = await import('../../services/identities/index.js');
        await assertSandboxSendAllowed(orgId, [body.to]);
      }

      // Suppression check → emit a 'rejected' event (SES suppression behaviour)
      // instead of sending to a bounced/complained/unsubscribed address.
      const { suppressions } = await import('../../db/schema/index.js');
      const [suppressed] = await db
        .select({ reason: suppressions.reason })
        .from(suppressions)
        .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, body.to.toLowerCase())))
        .limit(1);
      if (suppressed) {
        const { emitEmailEvent } = await import('../../services/webhooks/email-events.js');
        emitEmailEvent(orgId, 'rejected', { email: body.to, reason: suppressed.reason });
        return reply
          .code(202)
          .send({ data: { status: 'rejected', reason: `suppressed:${suppressed.reason}` } });
      }

      // Resolve a stored template (SES SendTemplatedEmail) when templateId is
      // given — subject/html/text come from the rendered template + merge vars.
      let subject = body.subject ?? '';
      let html = body.html ?? '';
      let text = body.text ?? '';
      if (body.templateId) {
        const { renderStoredTemplate } = await import(
          '../../services/transactional/render-template.js'
        );
        try {
          const rendered = await renderStoredTemplate(orgId, body.templateId, body.mergeVars ?? {});
          html = rendered.html;
          text = rendered.text;
          if (!subject) subject = rendered.subject; // template supplies the subject
        } catch (err) {
          // Emit a rendering-failure event (SES RenderingFailure) then surface 400.
          const { emitEmailEvent } = await import('../../services/webhooks/email-events.js');
          emitEmailEvent(orgId, 'rendering_failed', {
            email: body.to,
            templateId: body.templateId,
            error: (err as Error).message,
          });
          return reply
            .code(400)
            .send({ code: 'RENDERING_FAILED', message: (err as Error).message });
        }
      } else if (body.mergeVars) {
        // Inline body: simple {{var}} token substitution.
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
        replyTo: body.replyTo,
        subject: subject || '(no subject)',
        html: html || '<p></p>',
        text: text || undefined,
        orgId,
        attachments: body.attachments,
        customHeaders: body.headers,
        scheduleAt: body.scheduleAt ? new Date(body.scheduleAt) : undefined,
        sendingIp,
        tlsPolicy: cfgSet.tlsPolicy,
        testMode,
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
          configurationSet: body.configurationSet ?? null,
          sandbox: testMode,
          customArgs: body.customArgs ?? {},
          attachmentCount: body.attachments?.length ?? 0,
          ...body.metadata,
        },
      });

      // Fire the 'sent' webhook for API senders (previously never emitted).
      const { emitEmailEvent } = await import('../../services/webhooks/email-events.js');
      emitEmailEvent(orgId, 'sent', { messageId, email: body.to });

      // Per-email usage metering (PAYG) — previously recordUsage was never called.
      if (!testMode) {
        const { recordUsage } = await import('../../services/billing/meters.js');
        recordUsage(orgId, 'email', 1).catch(() => {});
      }

      return reply
        .code(202)
        .send({
          data: {
            messageId,
            status: body.scheduleAt ? 'scheduled' : 'queued',
            attachments: body.attachments?.length ?? 0,
          },
        });
    },
  );

  // ── Send raw MIME message (SES SendRawEmail equivalent) ───────────────────
  app.post(
    '/api/v1/transactional/email/raw',
    {
      preHandler: [app.authenticate, app.requireScope('emails:send')],
      schema: { tags: ['Transactional'], summary: 'Send a raw RFC5322/MIME message' },
    },
    async (req, reply) => {
      const body = z
        .object({
          // The raw message: either base64-encoded (recommended) or plain text.
          raw: z.string().min(10).max(20_000_000),
          encoding: z.enum(['base64', 'utf8']).default('base64'),
          // Optional envelope overrides — else taken from the parsed headers.
          from: z.string().email().optional(),
          to: z.array(z.string().email()).max(50).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      const rawStr =
        body.encoding === 'base64' ? Buffer.from(body.raw, 'base64').toString('utf8') : body.raw;
      const { sendRawMessage } = await import('../../services/transactional/raw-send.js');
      const result = await sendRawMessage(req.user!.orgId, rawStr, {
        from: body.from,
        to: body.to,
        metadata: body.metadata,
        testMode: req.user?.apiKeyMode === 'test',
      });
      return reply.code(202).send({ data: result });
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
      preHandler: [app.authenticate, app.requireScope('emails:send')],
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

      const orgId = req.user!.orgId;
      const testMode = req.user?.apiKeyMode === 'test';
      if (!testMode) await checkSendCapacity(orgId, unique.length);
      const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : undefined;

      const results = await Promise.all(
        unique.map(async (recipient) => {
          // Per-recipient merge-var substitution.
          let html = body.html ?? '';
          let text = body.text ?? '';
          if (recipient.mergeVars) {
            for (const [key, val] of Object.entries(recipient.mergeVars)) {
              const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
              html = html.replace(re, val);
              text = text.replace(re, val);
            }
          }

          const messageId = `<${randomUUID()}@forgemsg>`;
          await db.insert(emailEvents).values({
            orgId,
            eventType: 'send',
            messageId,
            metadata: {
              to: recipient.email,
              transactional: true,
              batch: true,
              mergeVars: recipient.mergeVars ?? {},
              tags: body.tags ?? [],
              scheduleAt: body.scheduleAt ?? null,
              templateId: body.templateId ?? null,
              testMode,
              ...recipient.metadata,
            },
          });

          // Actually enqueue the send (sandbox no-ops inside).
          await sendTransactionalEmail({
            to: recipient.email,
            from: body.from,
            fromName: body.fromName,
            subject: body.subject,
            html: html || '<p></p>',
            text: text || undefined,
            orgId,
            messageId,
            scheduleAt,
            testMode,
          });

          return {
            email: recipient.email,
            messageId,
            status: testMode ? 'test' : scheduleAt ? 'scheduled' : 'queued',
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
      preHandler: [app.authenticate, app.requireScope('emails:send')],
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

  // ── Activity export (#223) ────────────────────────────────────────────────
  // GET /api/v1/transactional/export?format=csv|json&dateFrom&dateTo&eventType
  app.get(
    '/api/v1/transactional/export',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Transactional'], summary: 'Export transactional activity (CSV or JSON)' },
    },
    async (req, reply) => {
      const q = z
        .object({
          format: z.enum(['csv', 'json']).default('json'),
          dateFrom: z.string().datetime().optional(),
          dateTo: z.string().datetime().optional(),
          eventType: z
            .enum(['send', 'open', 'click', 'bounce', 'complaint', 'unsubscribe'])
            .optional(),
          limit: z.coerce.number().int().min(1).max(50_000).default(10_000),
        })
        .parse(req.query);

      const orgId = req.user!.orgId;

      const conditions = [eq(emailEvents.orgId, orgId)];
      if (q.dateFrom) conditions.push(gte(emailEvents.createdAt, new Date(q.dateFrom)));
      if (q.dateTo) conditions.push(lte(emailEvents.createdAt, new Date(q.dateTo)));
      if (q.eventType) conditions.push(eq(emailEvents.eventType, q.eventType));

      const rows = await db
        .select({
          id: emailEvents.id,
          messageId: emailEvents.messageId,
          campaignId: emailEvents.campaignId,
          contactId: emailEvents.contactId,
          eventType: emailEvents.eventType,
          metadata: emailEvents.metadata,
          createdAt: emailEvents.createdAt,
        })
        .from(emailEvents)
        .where(and(...conditions))
        .limit(q.limit);

      if (q.format === 'json') {
        return reply.send({ data: rows, total: rows.length });
      }

      // CSV format
      const header = 'id,messageId,campaignId,contactId,eventType,createdAt\n';
      const csvRows = rows
        .map(
          (r) =>
            [
              r.id,
              r.messageId ?? '',
              r.campaignId ?? '',
              r.contactId ?? '',
              r.eventType,
              r.createdAt?.toISOString() ?? '',
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(','),
        )
        .join('\n');

      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="transactional-export.csv"`)
        .send(header + csvRows);
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
