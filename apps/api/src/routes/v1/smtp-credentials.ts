/**
 * SMTP submission credential management (customer-facing) + the internal
 * endpoints the Go port-587 submission server calls to authenticate an AUTH
 * attempt and to relay a received message.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSmtpCredential,
  listSmtpCredentials,
  deleteSmtpCredential,
  validateSmtpCredential,
} from '../../services/smtp/credentials.js';
import {
  smtpReplyFor,
  submissionPorts,
  suppressedRecipientReply,
} from '../../services/smtp/smtp-reply.js';
import {
  assertSenderVerified,
  configurationSetFromHeaders,
  sendTransactionalMessage,
  takeMessageSendRate,
  transactionalSuppression,
} from '../../services/transactional/send-message.js';
import { parseRawMime } from '../../services/transactional/mime-parse.js';
import { checkSendCapacity } from '../../services/billing/plan-enforcement.js';
import { AppError } from '../../lib/app-error.js';

const smtpCredentialRoutes: FastifyPluginAsync = async (app) => {
  // ── Customer-facing credential management ─────────────────────────────────
  app.get(
    '/api/v1/smtp-credentials',
    { preHandler: [app.requireAuth], schema: { tags: ['SMTP'] } },
    async (req) => {
      return { data: await listSmtpCredentials(req.user!.orgId) };
    },
  );

  app.post(
    '/api/v1/smtp-credentials',
    {
      preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['SMTP'], summary: 'Issue SMTP credentials (password shown once)' },
    },
    async (req, reply) => {
      const body = z.object({ label: z.string().max(100).optional() }).parse(req.body ?? {});
      const cred = await createSmtpCredential(req.user!.orgId, body.label);
      return reply.code(201).send({
        data: {
          ...cred,
          host: process.env.SMTP_SUBMISSION_HOST ?? 'smtp.example.invalid',
          // The port the engine actually opens: it reads SUBMISSION_LISTEN and
          // listens on that one port, STARTTLS only (no implicit TLS on 465).
          // This used to say [587, 2587] whatever ran — two ports from one
          // listener, or two from none. Empty when the server is not enabled.
          ports: submissionPorts(process.env.SUBMISSION_LISTEN),
          note: 'Save the password now — it cannot be retrieved again.',
        },
      });
    },
  );

  app.delete(
    '/api/v1/smtp-credentials/:id',
    {
      preHandler: [app.requireAuth, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['SMTP'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteSmtpCredential(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ── Internal endpoints ────────────────────────────────────────────────────
  //
  // Auth is the internal-auth plugin's onRequest hook, which guards every
  // /api/v1/internal/* path with a timing-safe compare against
  // env.INTERNAL_API_SECRET. These handlers used to repeat that check by hand
  // against the legacy `INTERNAL_SECRET` env name, which the API neither validates nor
  // any deployment sets; the duplicate is gone rather than corrected.
  //
  // Called by the Go submission server (apps/engine, port 587).
  app.post('/api/v1/internal/smtp/auth', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    const body = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const orgId = await validateSmtpCredential(body.username, body.password);
    if (!orgId) return reply.status(401).send({ ok: false });
    return reply.send({ data: { ok: true, orgId } });
  });

  // RCPT TO: an address this account must not mail is refused here, with a
  // permanent 550 — before the message is even sent, so it is never queued,
  // never recorded as sent and never billed, and the client does not retry it.
  // Same suppression list and reasons as POST /transactional/email.
  app.post('/api/v1/internal/smtp/rcpt', { schema: { tags: ['Internal'] } }, async (req) => {
    const body = z
      .object({ orgId: z.string().uuid(), rcpt: z.string().min(1).max(320) })
      .parse(req.body);
    const reason = await transactionalSuppression(body.orgId, body.rcpt);
    if (!reason) return { data: { accept: true } };
    const { emitEmailEvent } = await import('../../services/webhooks/email-events.js');
    emitEmailEvent(body.orgId, 'rejected', { email: body.rcpt, reason });
    return { data: { accept: false, smtp: suppressedRecipientReply(body.rcpt, reason) } };
  });

  // DATA: the message goes down the same path as POST /transactional/email —
  // one call of sendTransactionalMessage per recipient. It used to take a path
  // of its own (sendRawMessage), which skipped the suppression check, the send
  // rate, the sandbox gate, configuration sets, the IP pool and the `sent`
  // webhook (Z131). What is SMTP's own stays here: reading the message, the
  // From check the Go server cannot make, and the reply code.
  app.post(
    '/api/v1/internal/smtp/relay',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const body = z
        .object({
          orgId: z.string().uuid(),
          raw: z.string().min(10), // base64
          mailFrom: z.string().optional(),
          rcptTo: z.array(z.string()).max(100).optional(),
        })
        .parse(req.body);
      const rawStr = Buffer.from(body.raw, 'base64').toString('utf8');
      const parsed = parseRawMime(rawStr);
      const from = body.mailFrom || parsed.from;
      const recipients = body.rcptTo?.length ? body.rcptTo : [...parsed.to, ...parsed.cc];
      try {
        if (!from) throw AppError.badRequest('No From address in message');
        // The From is checked by sendTransactionalMessage, for every recipient
        // and before anything is written — the same check as HTTP since Z132.
        if (recipients.length === 0) throw AppError.badRequest('No recipients in message');
        if (!parsed.html && !parsed.text)
          throw AppError.badRequest('Message has no text/html body');
        // The whole message against the plan before the first recipient is
        // queued, so a plan that cannot take all of it refuses all of it.
        await checkSendCapacity(body.orgId, recipients.length);
        // One unit of the per-second rate for the message, not one per
        // recipient: accepted whole, or refused whole with 451 before anything
        // is queued, so a retry cannot duplicate a half-queued message (Z133).
        // The sender first: a refusal that will not change is answered as
        // such (550) and does not spend the unit.
        await assertSenderVerified(body.orgId, from);
        await takeMessageSendRate(body.orgId, false);

        // SMTP has no request body to name a configuration set in, so it comes
        // in a header. Without it the set — and the IP pool it picks — could
        // never apply to SMTP mail.
        const configurationSet = configurationSetFromHeaders(parsed.headers);

        const messages: Array<{ to: string; messageId: string }> = [];
        const rejected: Array<{ to: string; reason: string }> = [];
        for (const to of recipients) {
          const outcome = await sendTransactionalMessage({
            orgId: body.orgId,
            testMode: false,
            to,
            from,
            fromName: parsed.fromName ?? undefined,
            replyTo: parsed.replyTo ?? undefined,
            subject: parsed.subject ?? '(no subject)',
            html: parsed.html ?? `<pre>${(parsed.text ?? '').replace(/[<>&]/g, '')}</pre>`,
            text: parsed.text ?? undefined,
            headers: parsed.headers,
            configurationSet,
            metadata: { via: 'smtp', raw: true },
            // Relayed verbatim by the engine; the fields above route and record it.
            rawMime: rawStr,
            sendRateTaken: true,
          });
          if (outcome.status === 'rejected') rejected.push({ to, reason: outcome.reason });
          else if (outcome.status !== 'rendering_failed') {
            messages.push({ to, messageId: outcome.messageId });
          }
        }
        return reply.send({ data: { status: 'queued', messages, rejected } });
      } catch (err) {
        const smtp = smtpReplyFor(err);
        if (smtp.code >= 500) return reply.status(422).send({ smtp });
        req.log.warn({ err }, 'smtp relay: temporary failure');
        return reply.status(503).send({ smtp });
      }
    },
  );
};

export default smtpCredentialRoutes;
