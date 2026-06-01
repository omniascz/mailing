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

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';

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

const attachment = z.object({
  filename: z.string().min(1).max(255),
  /** Base64-encoded content. Resend matches MIME inferred from filename. */
  content: z.string().min(1).max(20 * 1024 * 1024), // 20 MB hard cap
  /** Override the inferred content-type. */
  content_type: z.string().max(127).optional(),
  /** Inline image cid. */
  content_id: z.string().max(255).optional(),
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
  amp_html: z.string().max(75 * 1024).optional(),
  cc: recipientList.optional(),
  bcc: recipientList.optional(),
  reply_to: recipientList.optional(),
  /** Free-form RFC 5322 headers, e.g. {"X-Entity-Ref-ID":"abc"}. */
  headers: z.record(z.string().max(2048)).optional(),
  tags: z.array(tagPair).max(20).optional(),
  attachments: z.array(attachment).max(40).optional(),
  /** ISO timestamp. */
  scheduled_at: z.string().datetime().optional(),
  /** Per-email tracking toggle. Defaults to org-level setting when omitted. */
  tracking: trackingFlags.optional(),
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
      preHandler: [app.authenticate],
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
            filename: a.filename,
            contentType: a.content_type ?? null,
            sizeBytes: Math.ceil((a.content.length * 3) / 4),
          })),
          transactional: true,
          scheduledAt: body.scheduled_at ?? null,
          tracking: body.tracking ?? null,
          ampHtml: ampHtmlPart,
          ampWarnings,
          source: 'resend-compatible',
          // Test-mode events are persisted so the developer can audit what
          // would have been sent; workers + analytics skip them.
          testMode: req.user?.apiKeyMode === 'test',
        },
      });

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
      preHandler: [app.authenticate],
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

      const createdAt = new Date();
      const data: ReturnType<typeof resendShape>[] = [];

      for (const item of parsed.data) {
        if (!item.html && !item.text) {
          return reply.code(422).send({
            statusCode: 422,
            name: 'validation_error',
            message: 'Each item must provide `html` or `text`.',
          });
        }
        const messageId = `<${randomUUID()}@forgemsg>`;
        const to = toArray(item.to);
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
            testMode: req.user?.apiKeyMode === 'test',
          },
        });
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
      const { id } = z
        .object({ id: z.string().min(1).max(255) })
        .parse(req.params);

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

      const sendRow =
        rows.find((r) => r.eventType === 'send') ?? rows[rows.length - 1]!;
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
        .where(
          and(
            eq(emailEvents.orgId, req.user!.orgId),
            eq(emailEvents.eventType, 'send'),
          ),
        )
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
      const body = z
        .object({ scheduled_at: z.string().datetime() })
        .safeParse(req.body);
      if (!body.success) {
        return reply.code(422).send({
          statusCode: 422,
          name: 'validation_error',
          message: 'scheduled_at must be a valid ISO timestamp',
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

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      meta.scheduledAt = body.data.scheduled_at;
      await db
        .update(emailEvents)
        .set({ metadata: meta })
        .where(eq(emailEvents.id, row.id));

      return reply.send({
        object: 'email',
        id: stripMessageIdBrackets(row.messageId!),
      });
    },
  );

  /**
   * DELETE /api/v1/emails/:id — cancel a scheduled email.
   * Mirrors Resend's cancel endpoint. Only effective while the message
   * hasn't actually been queued to the engine yet.
   */
  app.delete(
    '/api/v1/emails/:id',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Resend-compatible'],
        summary: 'Cancel a scheduled email',
      },
    },
    async (req, reply) => {
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

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      meta.cancelled = true;
      meta.cancelledAt = new Date().toISOString();
      await db
        .update(emailEvents)
        .set({ metadata: meta })
        .where(eq(emailEvents.id, row.id));

      return reply.send({
        object: 'email',
        id: stripMessageIdBrackets(row.messageId!),
      });
    },
  );
};

export default emailsRoutes;
