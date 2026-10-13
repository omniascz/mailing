/**
 * One transactional message, from acceptance to the queue — the path
 * POST /api/v1/transactional/email takes, and since Z131 the SMTP submission
 * relay too.
 *
 * The relay used to have a path of its own (sendRawMessage): no suppression
 * check, so a suppressed address was accepted, queued, recorded as sent and
 * billed — measured in Z129 — and no send-rate limit, no sandbox gate, no
 * configuration set or IP pool, no `sent` webhook. Moving the route's body here
 * and calling it from both is what makes them one path: whatever this function
 * checks, both check.
 *
 * Moved verbatim from routes/v1/transactional.ts. What stays in the route is
 * what is about HTTP: parsing the body, and turning a result into a reply.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents, suppressions } from '../../db/schema/index.js';
import { sendTransactionalEmail, type TransactionalAttachment } from '../../lib/queues.js';
import { checkSendCapacity } from '../billing/plan-enforcement.js';
import { AppError } from '../../lib/app-error.js';
import { assertFromDomainOwned, extractFromAddress } from '../sending/from-domain.js';
import { suppressionEmailIs } from '../suppressions/email.js';

/**
 * Suppression reasons that refuse a transactional message — the list the
 * mta-sender gate uses for this stream (SUPPRESSES_TRANSACTIONAL in
 * workers/src/jobs/mta-sender.ts, #225), so this route and /emails decide the
 * same. transactional-gate.integration.test.ts sends one receipt per reason
 * through both and fails if they ever disagree.
 */
export const SUPPRESSES_TRANSACTIONAL = [
  'hard_bounce',
  'complaint',
  'manual',
  'block',
  'invalid_email',
] as const;

export interface TransactionalMessage {
  orgId: string;
  /** Sandbox: validate and record, never dispatch, never bill. */
  testMode: boolean;
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject?: string;
  html?: string;
  text?: string;
  templateId?: string;
  mergeVars?: Record<string, string>;
  headers?: Record<string, string>;
  customArgs?: Record<string, string>;
  scheduleAt?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  configurationSet?: string;
  attachments?: TransactionalAttachment[];
  /** The message as the client wrote it (SMTP); relayed verbatim by the engine. */
  rawMime?: string;
}

export type TransactionalOutcome =
  | { status: 'queued' | 'scheduled'; messageId: string; attachments: number }
  | { status: 'rejected'; reason: string }
  | { status: 'rendering_failed'; message: string };

/**
 * The configuration set a raw message names. A raw message (SMTP, POST
 * /transactional/email/raw) has no JSON body to name one in, so it comes in a
 * header, as SES takes X-SES-CONFIGURATION-SET.
 */
export function configurationSetFromHeaders(headers: Record<string, string>): string | undefined {
  const value = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'x-configuration-set',
  )?.[1];
  return value?.trim() || undefined;
}

/**
 * The suppression row that refuses a transactional message to this address,
 * or null. Asked before anything is queued — by this function, and by the SMTP
 * server at RCPT TO, so a refused recipient is refused before the client sends
 * a byte of the message.
 */
export async function transactionalSuppression(
  orgId: string,
  email: string,
): Promise<string | null> {
  const [suppressed] = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.orgId, orgId),
        suppressionEmailIs(email),
        inArray(suppressions.reason, SUPPRESSES_TRANSACTIONAL),
      ),
    )
    .limit(1);
  return suppressed?.reason ?? null;
}

/**
 * The sender must be one the organisation has verified — the same condition the
 * SMTP relay applied before Z132, assertFromDomainOwned, which is the one
 * definition of a verified sender (a verified domain, or the verified address
 * itself). Asked first, before anything is queued, recorded or billed.
 *
 * POST /transactional/email did not ask at all: an unverified domain got 202
 * queued, a send event, a charge and an email.sent webhook (measured in Z131).
 * Refused here as 422 with a code of its own and the domain named; the shared
 * assertion keeps its 403 for the other paths that call it.
 */
export async function assertSenderVerified(orgId: string, from: string): Promise<void> {
  try {
    await assertFromDomainOwned(orgId, from);
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== 'FROM_NOT_VERIFIED') throw err;
    const address = extractFromAddress(from) ?? from.trim().toLowerCase();
    const domain = address.split('@')[1] ?? address;
    throw new AppError({
      code: 'SENDER_DOMAIN_NOT_VERIFIED',
      statusCode: 422,
      message:
        `The sender domain ${domain} is not verified for this account, so nothing was sent ` +
        `or billed. Verify ${domain} (or the address ${address} itself) under Sending Domains, ` +
        `then send again.`,
      details: { from: address, domain },
    });
  }
}

/**
 * The address a `send` row is keyed by: the bare address, lower-cased, so
 * "Ann <Ann@X.test>" and "ann@x.test" are one recipient. The unique index on
 * (org, message id, recipient) for `send` rows (migration 0030) compares this.
 */
export function recipientAddress(to: string): string {
  return extractFromAddress(to) ?? to.trim().toLowerCase();
}

export async function sendTransactionalMessage(
  msg: TransactionalMessage,
): Promise<TransactionalOutcome> {
  const { orgId, testMode } = msg;
  // In test mode too: a sandboxed message from someone else's domain is still
  // a message from someone else's domain.
  await assertSenderVerified(orgId, msg.from);
  if (!testMode) await checkSendCapacity(orgId, 1);
  // The per-second send rate is not taken at acceptance any more (Z134): the
  // MTA worker takes it when the message is sent, and paces rather than
  // refuses. The rate travels on the job. Same for every caller — single
  // messages, raw, SMTP, /messaging/send and batches alike.
  let orgSendRate: number | undefined;
  if (!testMode) {
    const { getOrgSendRate } = await import('../sending/send-rate.js');
    orgSendRate = (await getOrgSendRate(orgId)) || undefined;
  }

  // Apply the configuration set (throws 403 if the set's sending is paused).
  const { applyConfigurationSet } = await import('../configuration-sets/index.js');
  const cfgSet = await applyConfigurationSet(orgId, msg.configurationSet);
  // Resolve the config set's IP pool → sending IP for this send.
  let sendingIp = '';
  let sendingIpId: string | null = null;
  if (cfgSet.ipPoolId) {
    const { pickIpForSend } = await import('../dedicated-ips/index.js');
    const ip = await pickIpForSend(orgId, cfgSet.ipPoolId).catch(() => null);
    sendingIp = ip?.ipAddress ?? '';
    // Kept so the volume can be attributed after the message is accepted.
    // The address alone is not enough: recordIpSend is keyed by row id, so
    // a value that names no registered IP updates nothing rather than
    // creating a reputation row for whatever string arrived.
    sendingIpId = ip?.id ?? null;
  }

  // Sandbox gate: unverified accounts may only send to verified recipients.
  if (!testMode) {
    const { assertSandboxSendAllowed } = await import('../identities/index.js');
    await assertSandboxSendAllowed(orgId, [msg.to]);
  }

  // Suppression check → emit a 'rejected' event (SES suppression behaviour)
  // instead of sending to an address that must not be mailed.
  //
  // The same reasons the mta-sender gate refuses a transactional message
  // for (SUPPRESSES_TRANSACTIONAL, workers/src/jobs/mta-sender.ts) — every
  // reason except 'unsubscribe'. This check predates that gate and refused
  // on any row, so an unsubscribed customer's receipt was rejected here and
  // delivered through /emails. A marketing opt-out is not a refusal of the
  // receipt (#225); a bounce, a complaint, a block, an invalid address or
  // the org's own entry is.
  const suppressed = await transactionalSuppression(orgId, msg.to);
  if (suppressed) {
    const { emitEmailEvent } = await import('../webhooks/email-events.js');
    emitEmailEvent(orgId, 'rejected', { email: msg.to, reason: suppressed });
    return { status: 'rejected', reason: `suppressed:${suppressed}` };
  }

  // Resolve a stored template (SES SendTemplatedEmail) when templateId is
  // given — subject/html/text come from the rendered template + merge vars.
  let subject = msg.subject ?? '';
  let html = msg.html ?? '';
  let text = msg.text ?? '';
  if (msg.templateId) {
    const { renderStoredTemplate } = await import('./render-template.js');
    try {
      const rendered = await renderStoredTemplate(orgId, msg.templateId, msg.mergeVars ?? {});
      html = rendered.html;
      text = rendered.text;
      if (!subject) subject = rendered.subject; // template supplies the subject
    } catch (err) {
      // Emit a rendering-failure event (SES RenderingFailure); the caller answers 400.
      const { emitEmailEvent } = await import('../webhooks/email-events.js');
      emitEmailEvent(orgId, 'rendering_failed', {
        email: msg.to,
        templateId: msg.templateId,
        error: (err as Error).message,
      });
      return { status: 'rendering_failed', message: (err as Error).message };
    }
  } else if (msg.mergeVars) {
    // Inline body: simple {{var}} token substitution.
    for (const [key, val] of Object.entries(msg.mergeVars)) {
      const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      html = html.replace(re, val);
      text = text.replace(re, val);
    }
  }

  // Enqueue onto MTA-other (transactional priority) and get the canonical
  // messageId back. The Go engine performs the actual SMTP delivery.
  const messageId = await sendTransactionalEmail({
    to: msg.to,
    from: msg.from,
    fromName: msg.fromName,
    replyTo: msg.replyTo,
    subject: subject || '(no subject)',
    html: html || '<p></p>',
    text: text || undefined,
    orgId,
    attachments: msg.attachments,
    customHeaders: msg.headers,
    scheduleAt: msg.scheduleAt ? new Date(msg.scheduleAt) : undefined,
    sendingIp,
    tlsPolicy: cfgSet.tlsPolicy,
    testMode,
    rawMime: msg.rawMime,
    orgSendRate,
  });

  // Charge the IP for this message.
  //
  // At acceptance rather than at delivery, matching the two counters this
  // sits beside: recordFrequencySend in the batch sender is deliberately
  // taken before the enqueue, and the engine's warmup claim is spent
  // "whether or not it lands, because what the receiving ISP saw is a
  // connection from this IP". A rate limiter that under-counts is the
  // failure that costs reputation; one that over-counts costs a send.
  //
  // Best-effort: an accepted message must not be reported as failed
  // because its bookkeeping did not land.
  if (sendingIpId) {
    const { recordIpSend } = await import('../dedicated-ips/index.js');
    await recordIpSend(sendingIpId, 1).catch(() => {});
  }

  // Log send event for analytics + delivery webhooks. One `send` row is one
  // recipient — the unit the plan limit, its counter and the invoice count
  // (Z137); a sandboxed one is recorded and counted by none of them. The plan
  // send counter is kept by a trigger on this insert (migrations 0029, 0030).
  await db.insert(emailEvents).values({
    orgId,
    eventType: 'send',
    messageId,
    recipient: recipientAddress(msg.to),
    sandbox: testMode,
    metadata: {
      to: msg.to,
      transactional: true,
      tags: msg.tags ?? [],
      scheduleAt: msg.scheduleAt ?? null,
      templateId: msg.templateId ?? null,
      configurationSet: msg.configurationSet ?? null,
      sandbox: testMode,
      customArgs: msg.customArgs ?? {},
      attachmentCount: msg.attachments?.length ?? 0,
      ...msg.metadata,
    },
  });

  // Fire the 'sent' webhook for API senders (previously never emitted).
  const { emitEmailEvent } = await import('../webhooks/email-events.js');
  emitEmailEvent(orgId, 'sent', { messageId, email: msg.to });

  return {
    status: msg.scheduleAt ? 'scheduled' : 'queued',
    messageId,
    attachments: msg.attachments?.length ?? 0,
  };
}
