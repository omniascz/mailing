/**
 * Resend-compatible email API.
 *
 * Mirrors the Resend REST surface (POST /emails, POST /emails/batch, GET
 * /emails/:id) byte-for-byte so a customer migrating from Resend only has
 * to change the base URL — the SDK calls and payloads stay identical.
 *
 * Why a separate route module instead of folding into /transactional?
 *   • Resend uses snake_case keys (`reply_to`, `scheduled_at`); the legacy
 *     /transactional API uses camelCase. Keeping both means we don't break
 *     existing customers.
 *   • Resend returns a flat `{ id, from, to, created_at }` envelope where
 *     /transactional returns `{ data: { messageId, status } }`. We honour
 *     each convention in its own surface.
 *   • Idempotency-Key header support is Resend-specific.
 *
 * Auth: API key (X-API-Key header) via the existing authenticate decorator.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import {
  sendTransactionalEmail,
  scheduledEmailJobIds,
  rescheduleQueuedEmails,
  cancelQueuedEmails,
} from '../../lib/queues.js';
import { checkSendCapacity } from '../../services/billing/plan-enforcement.js';
import { parseScheduledAt } from '../../services/transactional/parse-scheduled-at.js';
import { fetchRemoteAttachment } from '../../services/sending/fetch-attachment.js';

// ─── Resend payload schemas ───────────────────────────────────────────────

const emailAddress = z
  .string()
  .max(320)
  .refine((s) => s.includes('@'), 'must be an email');

const recipientList = z.union([emailAddress, z.array(emailAddress).max(50)]);

const tagPair = z.object({
  name: z.string().min(1).max(64),
  value: z.string().min(0).max(256),
});

const attachment = z
  .object({
    filename: z.string().min(1).max(255).optional(),
    /** Base64-encoded content. Resend matches MIME inferred from filename. */
    content: z
      .string()
      .min(1)
      .max(20 * 1024 * 1024)
      .optional(), // 20 MB hard cap
    /** Remote URL (https) — fetched server-side with SSRF safeguards (Resend `path`). */
    path: z.string().url().max(2048).optional(),
    /** Override the inferred content-type. */
    content_type: z.string().max(127).optional(),
    /** Inline image cid. */
    content_id: z.string().max(255).optional(),
  })
  .refine((a) => (a.content ? !a.path : !!a.path), {
    message: 'attachment requires exactly one of content or path',
  })
  .refine((a) => (a.content ? !!a.filename : true), {
    message: 'inline base64 attachment requires a filename',
  });

const trackingFlags = z
  .object({
    opens: z.boolean().optional(),
    clicks: z.boolean().optional(),
  })
  .strict();

const sendEmailBody = z.object({
  from: z
    .string()
    .min(3)
    .max(384) // "Name <email>" up to 320 + name padding
    .refine((s) => s.includes('@'), 'must include an email'),
  to: recipientList,
  subject: z.string().min(1).max(998), // RFC 5322 line cap
  html: z.string().optional(),
  text: z.string().optional(),
  /** Optional AMP4EMAIL body — placed as text/x-amp-html before text/html. */
  amp_html: z
    .string()
    .max(75 * 1024)
    .optional(),
  cc: recipientList.optional(),
  bcc: recipientList.optional(),
  reply_to: recipientList.optional(),
  /** Free-form RFC 5322 headers, e.g. {"X-Entity-Ref-ID":"abc"}. */
  headers: z.record(z.string().max(2048)).optional(),
  tags: z.array(tagPair).max(20).optional(),
  attachments: z.array(attachment).max(40).optional(),
  /** ISO timestamp OR natural language ("in 1 hour", "tomorrow at 9am"). */
  scheduled_at: z
    .string()
    .max(100)
    .optional()
    .refine((v) => v == null || parseScheduledAt(v) !== null, {
      message: 'scheduled_at must be an ISO timestamp or a supported phrase (e.g. "in 1 hour").',
    }),
  /** Per-email tracking toggle. Defaults to org-level setting when omitted. */
  tracking: trackingFlags.optional(),
  /**
   * SendGrid mail_settings.sandbox_mode parity — validate + record the send
   * but never actually dispatch it. ORs with a test-mode API key.
   */
  sandbox_mode: z.boolean().optional(),
});

const batchBody = z.array(sendEmailBody).min(1).max(100);

// ─── Helpers ──────────────────────────────────────────────────────────────

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function resendShape(row: {
  messageId: string;
  to: string;
  from: string;
  subject?: string;
  createdAt: Date;
}) {
  return {
    id: stripMessageIdBrackets(row.messageId),
    from: row.from,
    to: toArray(row.to),
    subject: row.subject ?? '',
    created_at: row.createdAt.toISOString(),
  };
}

function stripMessageIdBrackets(id: string): string {
  // Internal format is `<uuid@forgemsg>`; Resend exposes a bare uuid.
  return id.replace(/^<|@forgemsg>$/g, '');
}

/**
 * Actually deliver a Resend-shaped email: enqueue one MTA job per recipient
 * (to + cc + bcc), all sharing the already-recorded `messageId` so delivery /
 * bounce / open webhooks correlate to the single returned id.
 *
 * - `fm_test_` keys → sandbox (recorded, never dispatched).
 * - `scheduled_at` in the future → BullMQ delay.
 * Returns the number of physical deliveries enqueued.
 */
async function dispatchResendEmail(
  orgId: string,
  messageId: string,
  item: z.infer<typeof sendEmailBody>,
  testMode: boolean,
): Promise<number> {
  const recipients = [...toArray(item.to), ...toArray(item.cc), ...toArray(item.bcc)];
  if (recipients.length === 0) return 0;

  // Resolves both ISO and natural-language ("in 1 hour"); validated at the
  // schema boundary, so a present value always parses here.
  const scheduleAt = item.scheduled_at
    ? (parseScheduledAt(item.scheduled_at) ?? undefined)
    : undefined;
  const replyTo = toArray(item.reply_to)[0];
  const customHeaders: Record<string, string> = { ...(item.headers ?? {}) };
  const cc = toArray(item.cc);
  if (cc.length > 0) customHeaders.Cc = cc.join(', ');

  // Resolve attachments: inline base64 as-is; remote `path` fetched server-side
  // with SSRF safeguards (https-only, private-IP block, size/time caps).
  const attachments = await Promise.all(
    (item.attachments ?? []).map(async (a) => {
      if (a.path) {
        const fetched = await fetchRemoteAttachment(a.path, a.filename);
        return {
          filename: fetched.filename,
          contentType: a.content_type ?? fetched.contentType,
          contentBase64: fetched.contentBase64,
          contentId: a.content_id,
          inline: a.content_id != null,
        };
      }
      return {
        filename: a.filename ?? 'attachment',
        contentType: a.content_type ?? 'application/octet-stream',
        contentBase64: a.content!,
        contentId: a.content_id,
        inline: a.content_id != null,
      };
    }),
  );

  // For scheduled sends, give each per-recipient job a deterministic jobId so
  // PATCH /emails/:id (reschedule) and cancel can find + mutate them later.
  const jobIds =
    scheduleAt && scheduleAt.getTime() > Date.now()
      ? scheduledEmailJobIds(stripMessageIdBrackets(messageId), recipients.length)
      : [];

  for (let i = 0; i < recipients.length; i++) {
    await sendTransactionalEmail({
      to: recipients[i]!,
      from: item.from,
      subject: item.subject,
      html: item.html || '<p></p>',
      text: item.text || undefined,
      replyTo,
      customHeaders,
      orgId,
      messageId,
      scheduleAt,
      testMode,
      ...(jobIds[i] ? { scheduleJobId: jobIds[i] } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });
  }
  return recipients.length;
}

/**
 * Reconstruct the deterministic scheduled-job ids for a stored send row from
 * its recipient counts (to + cc + bcc), matching dispatchResendEmail's order.
 */
function scheduledEmailJobIdsForRow(row: {
  messageId: string | null;
  metadata: unknown;
}): string[] {
  const m = (row.metadata ?? {}) as { to?: string[]; cc?: string[]; bcc?: string[] };
  const count = (m.to?.length ?? 0) + (m.cc?.length ?? 0) + (m.bcc?.length ?? 0);
  if (!row.messageId || count === 0) return [];
  return scheduledEmailJobIds(stripMessageIdBrackets(row.messageId), count);
}

/**
 * Idempotency-Key handling — Resend caches the first response for a
 * given key for 24 hours. We mirror that with Redis SET NX.
 */
const IDEMPOTENCY_TTL = 24 * 3600;

async function idempotencyCheck(
  orgId: string,
  key: string | undefined,
): Promise<{ cached: unknown | null; setCacheTag: ((value: unknown) => Promise<void>) | null }> {
  if (!key) return { cached: null, setCacheTag: null };
  const safeKey = key.slice(0, 256).replace(/[^A-Za-z0-9_\-:]/g, '');
  if (!safeKey) return { cached: null, setCacheTag: null };

  const redisKey = `idem:emails:${orgId}:${safeKey}`;
  const existing = await redis.get(redisKey).catch(() => null);
  if (existing) {
    try {
      return { cached: JSON.parse(existing) as unknown, setCacheTag: null };
    } catch {
      // Fall through and overwrite the bad cache below.
    }
  }
  return {
    cached: null,
    setCacheTag: async (value: unknown) => {
      await redis.setex(redisKey, IDEMPOTENCY_TTL, JSON.stringify(value)).catch(() => {});
    },
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────

const emailsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/v1/emails
   * Resend-compatible single send.
   */
  app.post(
    '/api/v1/emails',
    {
      preHandler: [app.authenticate, app.requireScope('emails:send')],
      schema: {
        tags: ['Resend-compatible'],
        summary: 'Send a single transactional email (Resend-compatible)',
      },
    },
    async (req, reply) => {
      const parsed = sendEmailBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
      }
      const body = parsed.data;

      if (!body.html && !body.text) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: 'Either `html` or `text` must be provided.',
        });
      }

      // AMP for Email — validate strictly so a malformed amp_html doesn't
      // produce mail Gmail will refuse anyway. We drop the AMP part on
      // validation failure rather than failing the whole request, so the
      // regular HTML delivery still goes through.
      let ampHtmlPart: string | null = null;
      let ampWarnings: string[] = [];
      if (body.amp_html) {
        const { renderAmp } = await import('../../services/editor/amp-renderer.js');
        const rendered = renderAmp(body.amp_html);
        ampHtmlPart = rendered.amp || null;
        ampWarnings = [...rendered.report.errors, ...rendered.report.warnings];
      }

      const idemKey = req.headers['idempotency-key'] as string | undefined;
      const { cached, setCacheTag } = await idempotencyCheck(req.user!.orgId, idemKey);
      if (cached) return reply.send(cached);

      const messageId = `<${randomUUID()}@forgemsg>`;
      const createdAt = new Date();
      const to = toArray(body.to);
      const testMode = req.user?.apiKeyMode === 'test' || body.sandbox_mode === true;

      // Enforce plan send-capacity for real (non-sandbox) sends before we
      // record or dispatch anything.
      const recipientCount = to.length + toArray(body.cc).length + toArray(body.bcc).length;
      if (!testMode) await checkSendCapacity(req.user!.orgId, recipientCount);

      await db.insert(emailEvents).values({
        orgId: req.user!.orgId,
        eventType: 'send',
        messageId,
        metadata: {
          to,
          from: body.from,
          subject: body.subject,
          cc: toArray(body.cc),
          bcc: toArray(body.bcc),
          replyTo: toArray(body.reply_to),
          headers: body.headers ?? {},
          tags: body.tags ?? [],
          attachments: (body.attachments ?? []).map((a) => ({
            filename: a.filename ?? null,
            contentType: a.content_type ?? null,
            // Remote (path) attachments are sized after fetch; base64 estimated here.
            sizeBytes: a.content ? Math.ceil((a.content.length * 3) / 4) : null,
            path: a.path ?? null,
          })),
          transactional: true,
          scheduledAt: body.scheduled_at ?? null,
          tracking: body.tracking ?? null,
          ampHtml: ampHtmlPart,
          ampWarnings,
          source: 'resend-compatible',
          // Test-mode events are persisted so the developer can audit what
          // would have been sent; workers + analytics skip them.
          testMode,
        },
      });

      // Actually deliver (sandbox no-ops inside dispatchResendEmail).
      await dispatchResendEmail(req.user!.orgId, messageId, body, testMode);

      const response = resendShape({
        messageId,
        to: to[0]!,
        from: body.from,
        subject: body.subject,
        createdAt,
      });

      if (setCacheTag) await setCacheTag(response);
      return reply.code(200).send(response);
    },
  );

  /**
   * POST /api/v1/emails/batch
   * Resend caps batch at 100 messages per request.
   */
  app.post(
    '/api/v1/emails/batch',
    {
      preHandler: [app.authenticate, app.requireScope('emails:send')],
      schema: {
        tags: ['Resend-compatible'],
        summary: 'Send up to 100 transactional emails in one request',
      },
    },
    async (req, reply) => {
      const parsed = batchBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
      }

      const idemKey = req.headers['idempotency-key'] as string | undefined;
      const { cached, setCacheTag } = await idempotencyCheck(req.user!.orgId, idemKey);
      if (cached) return reply.send(cached);

      // Validate every item up-front so we never partially send a bad batch.
      for (const item of parsed.data) {
        if (!item.html && !item.text) {
          return reply.code(422).send({
            statusCode: 422,
            name: 'validation_error',
            message: 'Each item must provide `html` or `text`.',
          });
        }
      }

      const keyTestMode = req.user?.apiKeyMode === 'test';
      // Only real (non-sandboxed) recipients count toward plan capacity.
      const totalRecipients = parsed.data.reduce((n, item) => {
        if (keyTestMode || item.sandbox_mode === true) return n;
        return n + toArray(item.to).length + toArray(item.cc).length + toArray(item.bcc).length;
      }, 0);
      if (totalRecipients > 0) await checkSendCapacity(req.user!.orgId, totalRecipients);

      const createdAt = new Date();
      const data: ReturnType<typeof resendShape>[] = [];

      for (const item of parsed.data) {
        const messageId = `<${randomUUID()}@forgemsg>`;
        const to = toArray(item.to);
        const testMode = keyTestMode || item.sandbox_mode === true;
        await db.insert(emailEvents).values({
          orgId: req.user!.orgId,
          eventType: 'send',
          messageId,
          metadata: {
            to,
            from: item.from,
            subject: item.subject,
            cc: toArray(item.cc),
            bcc: toArray(item.bcc),
            replyTo: toArray(item.reply_to),
            tags: item.tags ?? [],
            batch: true,
            transactional: true,
            scheduledAt: item.scheduled_at ?? null,
            tracking: item.tracking ?? null,
            source: 'resend-compatible',
            testMode,
          },
        });
        // Actually deliver each message (sandbox no-ops inside).
        await dispatchResendEmail(req.user!.orgId, messageId, item, testMode);
        data.push(
          resendShape({
            messageId,
            to: to[0]!,
            from: item.from,
            subject: item.subject,
            createdAt,
          }),
        );
      }

      const response = { data };
      if (setCacheTag) await setCacheTag(response);
      return reply.code(200).send(response);
    },
  );

  /**
   * GET /api/v1/emails/:id
   * Returns the same shape Resend does. We hydrate from the latest
   * email_events row tagged with the given message id.
   */
  app.get(
    '/api/v1/emails/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Resend-compatible'],
        summary: 'Retrieve a single email by id',
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1).max(255) }).parse(req.params);

      // Accept either the bare uuid or the bracketed message-id.
      const candidates = [id, `<${id}@forgemsg>`];

      const rows = await db
        .select()
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, req.user!.orgId),
            sql`${emailEvents.messageId} IN (${sql.join(
              candidates.map((c) => sql`${c}`),
              sql`, `,
            )})`,
          ),
        )
        .orderBy(desc(emailEvents.createdAt));

      if (rows.length === 0) {
        return reply.code(404).send({
          statusCode: 404,
          name: 'not_found',
          message: `Email with id ${id} not found.`,
        });
      }

      const sendRow = rows.find((r) => r.eventType === 'send') ?? rows[rows.length - 1]!;
      const meta = (sendRow.metadata ?? {}) as {
        to?: string[];
        from?: string;
        subject?: string;
        replyTo?: string[];
        cc?: string[];
        bcc?: string[];
        tags?: Array<{ name: string; value: string }>;
      };

      // Resend exposes a `last_event` field summarising the latest state.
      const latestEvent = rows[0]!;
      return reply.send({
        id: stripMessageIdBrackets(sendRow.messageId!),
        from: meta.from ?? '',
        to: meta.to ?? [],
        subject: meta.subject ?? '',
        cc: meta.cc ?? [],
        bcc: meta.bcc ?? [],
        reply_to: meta.replyTo ?? [],
        tags: meta.tags ?? [],
        created_at: sendRow.createdAt.toISOString(),
        last_event: latestEvent.eventType,
        last_event_at: latestEvent.createdAt.toISOString(),
      });
    },
  );

  /**
   * GET /api/v1/emails
   * List recent emails — paginated, ordered by created_at desc.
   */
  app.get(
    '/api/v1/emails',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Resend-compatible'],
        summary: 'List recent transactional emails',
      },
    },
    async (req, reply) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);

      const rows = await db
        .select()
        .from(emailEvents)
        .where(and(eq(emailEvents.orgId, req.user!.orgId), eq(emailEvents.eventType, 'send')))
        .orderBy(desc(emailEvents.createdAt))
        .limit(q.limit);

      return reply.send({
        data: rows.map((r) => {
          const meta = (r.metadata ?? {}) as { to?: string[]; from?: string; subject?: string };
          return resendShape({
            messageId: r.messageId!,
            to: meta.to?.[0] ?? '',
            from: meta.from ?? '',
            subject: meta.subject ?? '',
            createdAt: r.createdAt,
          });
        }),
      });
    },
  );

  /**
   * PATCH /api/v1/emails/:id — update scheduled send time.
   * Mirrors Resend's API for adjusting a scheduled send (e.g. moving by
   * +1h). Only `scheduled_at` is mutable; everything else stays frozen.
   */
  app.patch(
    '/api/v1/emails/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Resend-compatible'],
        summary: 'Update a scheduled email (move scheduled_at)',
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1).max(255) }).parse(req.params);
      const body = z.object({ scheduled_at: z.string().max(100) }).safeParse(req.body);
      if (!body.success) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: 'scheduled_at is required',
        });
      }
      const newSendAt = parseScheduledAt(body.data.scheduled_at);
      if (!newSendAt) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message:
            'scheduled_at must be an ISO timestamp or a supported phrase (e.g. "in 1 hour").',
        });
      }

      const candidates = [id, `<${id}@forgemsg>`];
      const [row] = await db
        .select()
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.orgId, req.user!.orgId),
            eq(emailEvents.eventType, 'send'),
            sql`${emailEvents.messageId} IN (${sql.join(
              candidates.map((c) => sql`${c}`),
              sql`, `,
            )})`,
          ),
        )
        .orderBy(desc(emailEvents.createdAt))
        .limit(1);
      if (!row) {
        return reply.code(404).send({
          statusCode: 404,
          name: 'not_found',
          message: `Email with id ${id} not found.`,
        });
      }

      // Actually move the queued jobs. If nothing moved, the email already sent
      // (or was never scheduled) — report that rather than silently "succeeding".
      const jobIds = scheduledEmailJobIdsForRow(row);
      const moved = await rescheduleQueuedEmails(jobIds, newSendAt);
      if (moved === 0) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'not_scheduled',
          message: 'Email is not scheduled or has already been sent; cannot reschedule.',
        });
      }

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      meta.scheduledAt = newSendAt.toISOString();
      await db.update(emailEvents).set({ metadata: meta }).where(eq(emailEvents.id, row.id));

      return reply.send({
        object: 'email',
        id: stripMessageIdBrackets(row.messageId!),
      });
    },
  );

  /**
   * Cancel a scheduled email — actually removes the queued job(s). Effective
   * only while the send hasn't left for the engine. Registered on Resend's
   * `POST /:id/cancel` and the legacy `DELETE /:id`.
   */
  const cancelScheduledEmail = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().min(1).max(255) }).parse(req.params);
    const candidates = [id, `<${id}@forgemsg>`];
    const [row] = await db
      .select()
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, req.user!.orgId),
          eq(emailEvents.eventType, 'send'),
          sql`${emailEvents.messageId} IN (${sql.join(
            candidates.map((c) => sql`${c}`),
            sql`, `,
          )})`,
        ),
      )
      .orderBy(desc(emailEvents.createdAt))
      .limit(1);
    if (!row) {
      return reply.code(404).send({
        statusCode: 404,
        name: 'not_found',
        message: `Email with id ${id} not found.`,
      });
    }

    // Actually remove the queued job(s). If none were removed, the send already
    // left / was never scheduled — say so instead of a false "cancelled".
    const removed = await cancelQueuedEmails(scheduledEmailJobIdsForRow(row));
    if (removed === 0) {
      return reply.code(422).send({
        statusCode: 422,
        name: 'not_scheduled',
        message: 'Email is not scheduled or has already been sent; cannot cancel.',
      });
    }

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    meta.cancelled = true;
    meta.cancelledAt = new Date().toISOString();
    await db.update(emailEvents).set({ metadata: meta }).where(eq(emailEvents.id, row.id));

    return reply.send({ object: 'email', id: stripMessageIdBrackets(row.messageId!) });
  };

  app.post(
    '/api/v1/emails/:id/cancel',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Cancel a scheduled email' },
    },
    cancelScheduledEmail,
  );
  app.delete(
    '/api/v1/emails/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Cancel a scheduled email (alias)' },
    },
    cancelScheduledEmail,
  );
};

export default emailsRoutes;
