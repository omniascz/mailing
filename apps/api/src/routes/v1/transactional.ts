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
import { redis } from '@forgemsg/shared/redis';
import { checkSendCapacity } from '../../services/billing/plan-enforcement.js';
import { and, eq, gte, lte } from 'drizzle-orm';
import {
  configurationSetFromHeaders,
  assertSenderVerified,
  sendTransactionalMessage,
  takeMessageSendRate,
} from '../../services/transactional/send-message.js';
import { parseRawMime } from '../../services/transactional/mime-parse.js';
import { AppError } from '../../lib/app-error.js';

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

      // The whole path — plan, send rate, configuration set and IP pool,
      // sandbox, suppression, template, queue, send event, `sent` webhook,
      // metering — is services/transactional/send-message.ts, shared with the
      // SMTP submission relay since Z131. This route only answers.
      const outcome = await sendTransactionalMessage({
        orgId,
        testMode,
        to: body.to,
        from: body.from,
        fromName: body.fromName,
        replyTo: body.replyTo,
        subject: body.subject,
        html: body.html,
        text: body.text,
        templateId: body.templateId,
        mergeVars: body.mergeVars,
        headers: body.headers,
        customArgs: body.customArgs,
        scheduleAt: body.scheduleAt,
        metadata: body.metadata,
        tags: body.tags,
        configurationSet: body.configurationSet,
        attachments: body.attachments,
      });

      if (outcome.status === 'rejected') {
        return reply.code(202).send({ data: { status: 'rejected', reason: outcome.reason } });
      }
      if (outcome.status === 'rendering_failed') {
        return reply.code(400).send({ code: 'RENDERING_FAILED', message: outcome.message });
      }
      return reply.code(202).send({
        data: {
          messageId: outcome.messageId,
          status: outcome.status,
          attachments: outcome.attachments,
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
      const orgId = req.user!.orgId;
      const testMode = req.user?.apiKeyMode === 'test';
      const parsed = parseRawMime(rawStr);
      const from = body.from ?? parsed.from;
      const recipients = body.to ?? [...parsed.to, ...parsed.cc];
      if (!from) throw AppError.badRequest('No From address in message');
      if (recipients.length === 0) throw AppError.badRequest('No recipients in message');
      if (!parsed.html && !parsed.text) throw AppError.badRequest('Message has no text/html body');
      // The whole message against the plan before the first recipient is
      // queued, as sendRawMessage did.
      if (!testMode) await checkSendCapacity(orgId, recipients.length);
      // The per-second rate counts accepted messages, not recipients: this
      // message takes one unit, now, or is refused whole (429) before anything
      // is queued (Z133).
      // A refusal that will not change comes first, so it is answered as such
      // and does not spend the unit.
      await assertSenderVerified(orgId, from);
      await takeMessageSendRate(orgId, testMode);

      // One recipient at a time down the path POST /transactional/email takes:
      // verified sender, plan, send rate, configuration set, sandbox,
      // suppression, send event, `sent` webhook, metering. This route used its
      // own (sendRawMessage), which had none of the suppression, rate, sandbox
      // or webhook steps (Z132).
      const messages: Array<{ to: string; messageId: string }> = [];
      const rejected: Array<{ to: string; reason: string }> = [];
      for (const to of recipients) {
        const outcome = await sendTransactionalMessage({
          orgId,
          testMode,
          to,
          from,
          fromName: parsed.fromName ?? undefined,
          replyTo: parsed.replyTo ?? undefined,
          subject: parsed.subject ?? '(no subject)',
          html: parsed.html ?? `<pre>${(parsed.text ?? '').replace(/[<>&]/g, '')}</pre>`,
          text: parsed.text ?? undefined,
          headers: parsed.headers,
          configurationSet: configurationSetFromHeaders(parsed.headers),
          metadata: { raw: true, ...body.metadata },
          // Relayed verbatim (SendRawEmail); the fields above route and record it.
          rawMime: rawStr,
          sendRateTaken: true,
        });
        if (outcome.status === 'rejected') rejected.push({ to, reason: outcome.reason });
        else if (outcome.status !== 'rendering_failed') {
          messages.push({ to, messageId: outcome.messageId });
        }
      }
      return reply.code(202).send({ data: { status: 'queued', messages, rejected } });
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

      // Message by message down the path POST /transactional/email takes
      // (Z133): verified sender, plan, configuration set, sandbox,
      // suppression, template, queue, send event, email.sent webhook,
      // metering. Batches do not take the per-second send rate at acceptance
      // (CTO decision, Z133). This route had its own path: no sender check, no
      // suppression check, no webhook, no metering, and templateId ignored.
      //
      // In order, not in parallel: a refusal of the request itself (an
      // unverified sender) comes from the first message, before anything of
      // this batch is written.
      const results: Array<
        | { email: string; messageId: string; status: string }
        | { email: string; status: 'rejected' | 'rendering_failed'; reason: string }
      > = [];
      for (const recipient of unique) {
        const outcome = await sendTransactionalMessage({
          orgId,
          testMode,
          to: recipient.email,
          from: body.from,
          fromName: body.fromName,
          subject: body.subject,
          html: body.html,
          text: body.text,
          templateId: body.templateId,
          mergeVars: recipient.mergeVars,
          scheduleAt: body.scheduleAt,
          tags: body.tags,
          metadata: {
            batch: true,
            mergeVars: recipient.mergeVars ?? {},
            testMode,
            ...recipient.metadata,
          },
          sendRateTaken: true,
        });
        if (outcome.status === 'rejected') {
          results.push({ email: recipient.email, status: 'rejected', reason: outcome.reason });
        } else if (outcome.status === 'rendering_failed') {
          results.push({
            email: recipient.email,
            status: 'rendering_failed',
            reason: outcome.message,
          });
        } else {
          results.push({
            email: recipient.email,
            messageId: outcome.messageId,
            status: testMode ? 'test' : outcome.status,
          });
        }
      }

      return reply.code(202).send({
        data: {
          queued: results.filter((r) => 'messageId' in r).length,
          deduplicated: body.recipients.length - unique.length,
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
      schema: {
        tags: ['Transactional'],
        summary: 'Send up to 1000 personalized transactional emails (with batchId tracking)',
      },
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
          // SendGrid parity: schedule the batch for a future time. It can be
          // paused/resumed or cancelled before it fires.
          sendAt: z.string().datetime().optional(),
        })
        .parse(req.body);

      if (!body.html && !body.text && !body.templateId) {
        return reply
          .code(400)
          .send({ code: 'BODY_REQUIRED', message: 'Provide html, text, or templateId' });
      }

      const orgId = req.user!.orgId;
      const batchId = randomUUID();
      const {
        scheduleBatch,
        runTransactionalBatch,
        batchKey: mkBatchKey,
      } = await import('../../services/transactional/scheduled-batch.js');

      // ── Scheduled path — persist for the cron, don't send now ──────────────
      const sendAt = body.sendAt ? new Date(body.sendAt) : null;
      // A test key's batch is sandboxed — now, or when the cron sends it. It
      // used to be sent for real either way (Z133).
      const testMode = req.user?.apiKeyMode === 'test';
      const payload = { ...body, testMode };
      if (sendAt && sendAt.getTime() > Date.now()) {
        const rec = await scheduleBatch(orgId, batchId, payload, sendAt);
        return reply.code(202).send({
          data: {
            batchId,
            status: rec.status,
            total: rec.total,
            deduplicated: rec.deduplicated,
            sendAt: rec.sendAt,
          },
        });
      }

      // ── Immediate path ─────────────────────────────────────────────────────
      if (!testMode) await checkSendCapacity(orgId, body.recipients.length);
      const out = await runTransactionalBatch(orgId, payload);

      await redis.set(
        mkBatchKey(orgId, batchId),
        JSON.stringify({
          batchId,
          orgId,
          total: out.total,
          queued: out.queued,
          failed: out.failed,
          deduplicated: out.deduplicated,
          status: 'queued',
          createdAt: new Date().toISOString(),
        }),
        'EX',
        604800,
      );

      return reply.code(202).send({
        data: {
          batchId,
          total: out.total,
          queued: out.queued,
          failed: out.failed,
          deduplicated: out.deduplicated,
          results: out.results,
        },
      });
    },
  );

  // ── Cancel / pause / resume a scheduled batch (#541 / SendGrid parity) ─────
  const lifecycle: Array<{ verb: 'cancel' | 'pause' | 'resume'; summary: string }> = [
    { verb: 'cancel', summary: 'Cancel a scheduled transactional batch' },
    { verb: 'pause', summary: 'Pause a scheduled transactional batch' },
    { verb: 'resume', summary: 'Resume a paused transactional batch' },
  ];
  for (const { verb, summary } of lifecycle) {
    app.post(
      `/api/v1/transactional/batch/:batchId/${verb}`,
      {
        preHandler: [app.authenticate, app.requireScope('emails:send')],
        schema: { tags: ['Transactional'], summary },
      },
      async (req, reply) => {
        const { batchId } = req.params as { batchId: string };
        const orgId = req.user!.orgId;
        const svc = await import('../../services/transactional/scheduled-batch.js');
        const fn = { cancel: svc.cancelBatch, pause: svc.pauseBatch, resume: svc.resumeBatch }[
          verb
        ];
        try {
          const rec = await fn(orgId, batchId);
          return reply.send({ data: { batchId, status: rec.status } });
        } catch (err) {
          const code = err instanceof Error ? err.message : 'BATCH_ERROR';
          if (code === 'BATCH_NOT_FOUND') {
            return reply.code(404).send({ code, message: 'Batch not found or expired' });
          }
          return reply
            .code(409)
            .send({ code, message: `Batch cannot be ${verb}ed in its current state` });
        }
      },
    );
  }

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
        .map((r) =>
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
      const { getBatch } = await import('../../services/transactional/scheduled-batch.js');
      const rec = await getBatch(orgId, batchId);
      if (!rec) {
        return reply
          .code(404)
          .send({ code: 'BATCH_NOT_FOUND', message: 'Batch not found or expired' });
      }
      // Never leak the stored recipient payload in the status response.
      const { payload: _omit, ...view } = rec;
      return reply.send({ data: view });
    },
  );
};

export default transactionalRoutes;
