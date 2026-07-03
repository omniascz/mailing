/**
 * BullMQ queue clients used by the API to enqueue workflow jobs.
 * Workers in apps/workers consume these queues.
 */

import { Queue } from 'bullmq';

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

export const emailQueue = new Queue('email', queueOpts);
export const smsQueue = new Queue('sms', queueOpts);
export const webhookQueue = new Queue('webhook', queueOpts);
/** Viber Business Messages async send queue (consumed by apps/workers viber-sender). */
export const viberQueue = new Queue('viber-send', queueOpts);
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
export const mtaOtherQueue = new Queue('mta-other', queueOpts);

import { randomUUID } from 'node:crypto';

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

  // Future scheduled sends ride a BullMQ delay so the worker only picks them
  // up when due. Past/now → delay 0 (immediate).
  const delayMs = input.scheduleAt ? Math.max(0, input.scheduleAt.getTime() - Date.now()) : 0;

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
      tlsPolicy: input.tlsPolicy ?? '',
      rawMime: input.rawMime ?? '',
      priority: PRIORITY.TRANSACTIONAL,
      stream: 'transactional',
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
