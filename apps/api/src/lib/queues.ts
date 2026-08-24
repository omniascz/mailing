/**
 * BullMQ queue clients used by the API to enqueue workflow jobs.
 * Workers in apps/workers consume these queues.
 */

import { Queue } from 'bullmq';
import { guardQueue } from './queue-contracts.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const connection = parseRedisUrl(REDIS_URL);

const queueOpts = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
};

/**
 * The three contracted queues are handed to `guardQueue`, which replaces `add`
 * and `addBulk` on the instance so the consumer's schema is checked however a
 * producer reaches the queue. The raw `new Queue(...)` is never bound to a
 * name — there is no unguarded reference to import. See queue-contracts.ts.
 */
export const emailQueue = guardQueue(new Queue('email', queueOpts), 'email');
export const smsQueue = guardQueue(new Queue('sms', queueOpts), 'sms');
/**
 * Webhook delivery. Its own options because the default 3 attempts / 5 s is
 * tuned for our own services, and a customer's endpoint is not one of those —
 * a receiver that is redeploying needs minutes, not fifteen seconds.
 *
 * attempts 5, exponential from 30 s → BullMQ waits 30, 60, 120, 240 s between
 * tries (Math.round(2^(attemptsMade-1) * delay)), so a delivery lives about
 * 7.5 minutes before it is given up on.
 *
 * This is the ONLY retry mechanism. deliverWebhook used to compute its own
 * nextRetryAt and write status 'retrying'; nothing re-enqueued those rows, so
 * they sat there forever.
 */
export const webhookQueue = new Queue('webhook', {
  ...queueOpts,
  defaultJobOptions: {
    ...queueOpts.defaultJobOptions,
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 30_000 },
  },
});
/** Viber Business Messages async send queue (consumed by apps/workers viber-sender). */
export const viberQueue = guardQueue(new Queue('viber-send', queueOpts), 'viber-send');
/** RCS async send queue (consumed by apps/workers rcs-sender). */
export const rcsQueue = new Queue('rcs-send', queueOpts);
/** WhatsApp async send queue (Meta Cloud API worker consumer). */
export const whatsappQueue = new Queue('whatsapp-send', queueOpts);
/** Web Push / FCM async send queue. */
export const pushQueue = new Queue('push-send', queueOpts);
/** Native mobile push (APNs/FCM) async send queue — consumed by mobile-push-sender. */
export const mobilePushQueue = new Queue('mobile-push-send', queueOpts);
/** Voice-call async queue (voice-bot outbound). */
export const voiceQueue = new Queue('voice-call', queueOpts);

/**
 * Campaign-splitter producer. Workers in apps/workers consume from this
 * same Redis-backed queue (name must match worker's
 * `QUEUE_NAMES.CAMPAIGN_SPLITTER`). Job priority 3 marks bulk campaign
 * sends; transactional (1) and triggered (2) take precedence.
 */
export const campaignSplitterQueue = new Queue('campaign-splitter', queueOpts);

/**
 * Triggered batch-sender producer. Single-recipient triggered sends (workflow
 * "send email" actions, sequences) enqueue here; the workers' triggered
 * batch-sender consumes 'batch-sender-triggered' and runs the full
 * render → track → suppress → MTA pipeline for the one contact.
 */
export const batchSenderTriggeredQueue = new Queue('batch-sender-triggered', queueOpts);

export const PRIORITY = {
  TRANSACTIONAL: 1,
  TRIGGERED: 2,
  CAMPAIGN: 3,
} as const;

/**
 * MTA-other producer. The workers' MTA pool routes each per-ISP queue
 * to the Go engine via gRPC; mta-other is the catch-all for any domain
 * not matched by one of the dedicated queues (gmail/microsoft/yahoo/
 * seznam/volny/centrum). Transactional emails — DOI confirmations,
 * password reset, verify email, campaign test sends — go here so we
 * don't need separate plumbing for one-shot sends.
 */
/**
 * Same Redis queue the workers' `mtaQueues.other` writes to, so it must carry
 * the same retry window: job options come from whoever added the job, and this
 * queue used to hand transactional mail 3 attempts over ~15 seconds while the
 * campaign path handed the identical queue 6 over 31 minutes.
 *
 * Fifteen seconds does not survive greylisting, which is standard at Czech
 * providers and asks the sender to come back in five minutes. The question is
 * not "31 minutes late or now" — the first attempt was refused, so it cannot be
 * now. It is "31 minutes late or never". A password reset that arrives half an
 * hour late is a poor experience; one that never arrives is a support ticket.
 *
 * This is the MTA hop, not the API→worker hop. The deliberately short window on
 * batchSenderQueues.transactional (6 × 2 s) is a different decision about a
 * different stage and is untouched.
 */
export const mtaOtherQueue = new Queue('mta-other', {
  ...queueOpts,
  defaultJobOptions: {
    ...queueOpts.defaultJobOptions,
    attempts: 6,
    backoff: { type: 'exponential' as const, delay: 60_000 },
  },
});

import { randomUUID } from 'node:crypto';
import { encodeVerp } from '@forgemsg/shared/sending/verp';

/**
 * Per-message VERP return path, or '' when no bounce domain is configured —
 * the same ternary batch-sender.ts uses, so both paths are off or on together
 * rather than disagreeing.
 */
function verpReturnPath(messageId: string): string {
  const domain = process.env.VERP_BOUNCE_DOMAIN ?? '';
  return domain ? encodeVerp(messageId, domain) : '';
}

export interface TransactionalAttachment {
  filename: string;
  contentType: string;
  /** Base64-encoded file content (kept JSON-serialisable through the queue). */
  contentBase64: string;
  contentId?: string;
  inline?: boolean;
}

export interface TransactionalEmailInput {
  to: string;
  toName?: string;
  from: string;
  fromName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Optional org context — feeds tracking/audit if set. */
  orgId?: string;
  /** Optional contact ID if this is to a known recipient. */
  contactId?: string;
  /** File attachments (e-ticket PDFs etc.). Omit for link-only delivery. */
  attachments?: TransactionalAttachment[];
  /**
   * Pre-generated message id for event correlation. When the caller has
   * already written the `send` email_events row it must pass the same id here
   * so delivery/bounce/open webhooks line up. Generated if omitted.
   */
  messageId?: string;
  /** Extra RFC 5322 headers (Cc, X-Entity-Ref-ID, …). */
  customHeaders?: Record<string, string>;
  /**
   * Future send time. When in the future the job is enqueued with a BullMQ
   * delay so the MTA picks it up at the right moment; past/now sends now.
   */
  scheduleAt?: Date;
  /**
   * Sandbox: record intent but do NOT dispatch to the MTA. Used by `fm_test_`
   * API keys so developers can exercise the API without delivering mail.
   */
  testMode?: boolean;
  /** Source IP (from a configuration set's IP pool). '' = engine default pool. */
  sendingIp?: string;
  /** TLS policy ('require' | 'optional') from a configuration set. */
  tlsPolicy?: string;
  /**
   * Raw RFC 5322 MIME. When set the engine relays it verbatim (SendRawEmail)
   * instead of recomposing from html/text — preserves S/MIME + pre-signed DKIM.
   */
  rawMime?: string;
  /**
   * Stable BullMQ jobId for a *scheduled* send, so it can later be rescheduled
   * (changeDelay) or cancelled (remove). Only applied when scheduleAt is future.
   */
  scheduleJobId?: string;
}

/** Deterministic jobIds for a scheduled email's per-recipient jobs. */
export function scheduledEmailJobIds(bareMessageId: string, recipientCount: number): string[] {
  const safe = bareMessageId.replace(/[^A-Za-z0-9_-]/g, '');
  return Array.from({ length: recipientCount }, (_, i) => `sched-email:${safe}:${i}`);
}

/**
 * Reschedule already-queued (delayed) emails to a new time. Returns how many
 * jobs were actually moved (0 = nothing found / already sent).
 */
export async function rescheduleQueuedEmails(jobIds: string[], sendAt: Date): Promise<number> {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  let moved = 0;
  for (const jobId of jobIds) {
    try {
      const job = await mtaOtherQueue.getJob(jobId);
      if (job) {
        await job.changeDelay(delay);
        moved++;
      }
    } catch {
      // job already active/removed — skip
    }
  }
  return moved;
}

/**
 * Cancel already-queued (delayed) emails. Returns how many jobs were removed
 * (0 = nothing found / already sent).
 */
export async function cancelQueuedEmails(jobIds: string[]): Promise<number> {
  let removed = 0;
  for (const jobId of jobIds) {
    try {
      const job = await mtaOtherQueue.getJob(jobId);
      if (job) {
        await job.remove();
        removed++;
      }
    } catch {
      // job already active/removed — skip
    }
  }
  return removed;
}

/**
 * Enqueue a one-shot transactional email. Returns the synthetic
 * messageId so callers can correlate with email_events. The actual
 * SMTP delivery happens asynchronously via the Go MTA — this only
 * returns once the job is on the queue.
 *
 * For DOI / verify / reset emails, callers should construct the HTML
 * inline (small enough that a real templating system is overkill).
 * For marketing emails go through the campaign-splitter flow instead.
 */
export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<string> {
  const messageId = input.messageId ?? `<txn-${randomUUID()}@forgemsg>`;

  // Sandbox: `fm_test_` keys record the intent (the caller still writes the
  // email_events row) but nothing is dispatched to the MTA.
  if (input.testMode) return messageId;

  // Sink addresses (delivered@ / bounced@ / …) simulate the outcome + fire the
  // matching webhooks instead of delivering. Skips the MTA entirely.
  const sinks = await import('../services/sending/sink-addresses.js');
  const sink = sinks.parseSinkAddress(input.to);
  if (sink) {
    await sinks.simulateSink(input.orgId ?? '', messageId, input.to, sink).catch(() => {});
    return messageId;
  }

  // Future scheduled sends ride a BullMQ delay so the worker only picks them
  // up when due. Past/now → delay 0 (immediate).
  const delayMs = input.scheduleAt ? Math.max(0, input.scheduleAt.getTime() - Date.now()) : 0;

  // DKIM. This payload was built by hand and simply had no dkim* fields, and
  // the consumer declares all three optional, so nothing complained — the Go
  // engine signs only when handed a key (`msg.DkimConfig != nil &&
  // PrivateKeyPEM != ""`, engine/internal/smtp/sender.go:134), with no else and
  // no default key. DOI confirmations, password resets, identity verification
  // and customer order confirmations all went out unsigned, on a shared pool.
  //
  // Same resolver as campaign dispatch, so the same From address is signed with
  // the same key whichever path sends it.
  //
  // Only with an org id: the lookup is org-scoped and a caller without one
  // (services/identities/index.ts) has nothing to scope to — queues.ts
  // substitutes a random uuid for the payload field below, and a lookup on that
  // would be a wasted query with a guaranteed null.
  //
  // Null is not an error. A verified single email identity has no key and no
  // domain row to hold one, and system mail is sent from OUR domain under the
  // CUSTOMER's org id, which is org-scoped away. Unsigned is then the only
  // outcome available, and for a DOI confirmation an unsigned mail that arrives
  // beats a refused one that never does — a confirmation never sent is a
  // consent record that never exists. The absence is logged so it is countable
  // rather than silent.
  let dkim: { dkimDomain: string; dkimSelector: string; dkimPrivateKey: string } | null = null;
  if (input.orgId) {
    const { resolveDkimForSender } = await import('../services/domains/dkim-rotation.js');
    dkim = await resolveDkimForSender(input.orgId, input.from).catch(() => null);
    if (!dkim) {
      console.warn(
        `[dkim] sending unsigned: no active key for From=${input.from} org=${input.orgId} stream=transactional`,
      );
    }
  }

  await mtaOtherQueue.add(
    `txn-${randomUUID()}`,
    {
      // synthetic campaign ID; mta-sender worker logs against this for
      // traceability but doesn't expect a real campaigns row to exist.
      campaignId: input.orgId ?? randomUUID(),
      orgId: input.orgId ?? randomUUID(),
      contactId: input.contactId ?? randomUUID(),
      messageId,
      fromEmail: input.from,
      fromName: input.fromName ?? '',
      toEmail: input.to,
      toName: input.toName ?? '',
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text ?? '',
      replyTo: input.replyTo ?? '',
      customHeaders: input.customHeaders ?? {},
      sendingIp: input.sendingIp ?? '',
      returnPath: verpReturnPath(messageId),
      // VERP envelope sender, same codec the campaign path uses
      // (workers/jobs/batch-sender.ts). Without it the engine falls back to the
      // header From (engine/internal/smtp/sender.go:169), so a DSN for a DOI
      // confirmation or a password reset is delivered to the customer's own
      // mailbox and our inbound side never sees it — the address is never
      // suppressed and the next campaign mails it again.
      //
      // The domain is validated in the workers env schema, which is the process
      // that reads it there; here it is still a raw read. Bringing it under the
      // API schema too is a configuration change, not a send-path one.
      tlsPolicy: input.tlsPolicy ?? '',
      rawMime: input.rawMime ?? '',
      priority: PRIORITY.TRANSACTIONAL,
      stream: 'transactional',
      // Spread as a group or not at all. mta-sender keys the whole gRPC dkim
      // message off `data.dkimDomain` being truthy, so an empty-string domain
      // would send the engine a config with no key — which it then skips on the
      // PrivateKeyPEM check, arriving at the same unsigned mail by a longer road.
      ...(dkim ?? {}),
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    },
    {
      priority: PRIORITY.TRANSACTIONAL,
      ...(delayMs > 0 ? { delay: delayMs } : {}),
      // Stable jobId only for future sends, so PATCH/cancel can find the job.
      ...(delayMs > 0 && input.scheduleJobId ? { jobId: input.scheduleJobId } : {}),
    },
  );
  return messageId;
}

/** Convenience map used by workflow actions */
export const queues = {
  email: emailQueue,
  sms: smsQueue,
  webhook: webhookQueue,
  viber: viberQueue,
  rcs: rcsQueue,
  whatsapp: whatsappQueue,
  push: pushQueue,
  mobilePush: mobilePushQueue,
  voice: voiceQueue,
  campaignSplitter: campaignSplitterQueue,
  mtaOther: mtaOtherQueue,
};
