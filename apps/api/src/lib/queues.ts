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
  const messageId = `<txn-${randomUUID()}@forgemsg>`;
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
      customHeaders: {},
      priority: PRIORITY.TRANSACTIONAL,
      stream: 'transactional',
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    },
    { priority: PRIORITY.TRANSACTIONAL },
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
  campaignSplitter: campaignSplitterQueue,
  mtaOther: mtaOtherQueue,
};
