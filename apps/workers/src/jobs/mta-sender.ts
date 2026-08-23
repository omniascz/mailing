/**
 * MTASender job — delivers a single email via the Go MTA engine (gRPC).
 *
 * This worker consumes from per-ISP queues (mta-gmail, mta-microsoft, etc.)
 * and forwards each message to the Go MTA via gRPC.
 *
 * On failure:
 *   - Soft bounce / temp failure → let BullMQ retry (exponential backoff)
 *   - Hard bounce → mark failed, add to suppression list
 *   - Block → alert, do NOT suppress
 *
 * Receives: MtaSendJobData from mta-{isp} queues
 * Produces: send/bounce/fail events to the event pipeline (Kafka / internal API)
 */

import { Worker, type Job } from 'bullmq';
import { captureJobException } from '../lib/telemetry.js';
import { connection, QUEUE_NAMES, type MtaSendJobData } from '../queues/index.js';
import { defer, deferralCount, nextUtcMidnight } from '../lib/defer.js';
import { streamBackoff } from '../lib/stream-backoff.js';
import * as mtaClient from '../lib/mta-grpc-client.js';
import {
  checkThrottle,
  recordThrottleSignal,
  throttleRefillMs,
  detectIsp,
} from '@forgemsg/shared/sending/isp-throttle';
import { internalHeaders } from '../lib/internal-api.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Adaptive-throttle backpressure: when an ISP bucket is exhausted a message is
// re-enqueued (with a delay) onto its own queue rather than dropped. Capped so
// a persistently-throttled message isn't deferred forever.
const THROTTLE_MAX_DEFERRALS = 20; // then send anyway rather than hold forever
/**
 * Longest single throttle sleep. The token window is an hour, so without a cap
 * one refusal could park a message for that long; 10 minutes keeps it moving
 * and still costs a twentieth of the Redis round-trips the old 60-second poll
 * did.
 */
const THROTTLE_MAX_SLEEP_MS = 10 * 60_000;

/** Nights a message will wait for warmup capacity before it is called failed. */
const MAX_WARMUP_DEFERRALS = 2;

/**
 * The engine's warmup rejection, matched on its text because it arrives with
 * no SMTP code — see apps/engine/internal/warmup/warmup.go, ErrAllExhausted.
 */
function isWarmupQuotaExhausted(error: string | undefined): boolean {
  return !!error && /warmup:.*daily limit/i.test(error);
}

// ─── MTA Client (gRPC to Go engine) ──────────────────────────────────────────

interface MtaSendResult {
  success: boolean;
  messageId: string;
  smtpCode: number;
  smtpMessage: string;
  error: string;
  durationMs: number;
}

/**
 * Send an email via the Go MTA engine over gRPC.
 *
 * Endpoint: MTA_GRPC_ENDPOINT env var (default: localhost:50051).
 * Transport: insecure for local dev; TLS via envoy/proxy in production.
 */
async function sendViaMta(data: MtaSendJobData): Promise<MtaSendResult> {
  try {
    const res = await mtaClient.send({
      messageId: data.messageId,
      fromEmail: data.fromEmail,
      fromName: data.fromName,
      toEmail: data.toEmail,
      toName: data.toName,
      subject: data.subject,
      htmlBody: data.htmlBody,
      textBody: data.textBody ?? '',
      replyTo: data.replyTo ?? '',
      customHeaders: data.customHeaders,
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      sendingIp: data.sendingIp ?? '', // resolved from the org's pool; '' = engine default
      returnPath: data.returnPath ?? '', // VERP envelope sender; '' = use From
      tlsPolicy: data.tlsPolicy ?? '', // 'require' = abort if no STARTTLS
      rawMime: data.rawMime ?? '', // relayed verbatim when set (SendRawEmail)
      dkim: data.dkimDomain
        ? {
            domain: data.dkimDomain,
            selector: data.dkimSelector ?? '',
            privateKeyPem: data.dkimPrivateKey ?? '',
          }
        : undefined,
      attachments: data.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentId: a.contentId,
        inline: a.inline,
      })),
    });

    return {
      success: res.success,
      messageId: res.messageId,
      smtpCode: res.smtpCode,
      smtpMessage: res.smtpMessage,
      error: res.error,
      // proto int64 → string; parseInt safe (durations fit in MAX_SAFE_INTEGER)
      durationMs: Number.parseInt(res.durationMs, 10) || 0,
    };
  } catch (err) {
    // gRPC ServiceError has .code (status code) and .details/.message
    const e = err as Error & { code?: number; details?: string };
    const detail = e.details ?? e.message;
    return {
      success: false,
      messageId: data.messageId,
      smtpCode: 0,
      smtpMessage: '',
      error: `MTA gRPC error${e.code !== undefined ? ` (${e.code})` : ''}: ${detail}`,
      durationMs: 0,
    };
  }
}

// ─── Bounce classification ───────────────────────────────────────────────────

function isHardBounce(smtpCode: number): boolean {
  return smtpCode >= 550 && smtpCode <= 559;
}

function isSoftBounce(smtpCode: number): boolean {
  return smtpCode >= 400 && smtpCode < 500;
}

function isBlockBounce(smtpCode: number, message: string): boolean {
  if (smtpCode === 554 || smtpCode === 521) return true;
  return /blocked|blacklist|policy|spam|rbl/i.test(message);
}

/**
 * Is this the last attempt BullMQ will make?
 *
 * `attemptsMade` is the count of attempts already finished, so inside the
 * handler for attempt n it reads n-1 (measured: a 6-attempt job logs 0..5).
 * The distinction matters because a retryable failure is only news on the way
 * past — the terminal event is what deliverability is allowed to count.
 */
function isFinalAttempt(job: { attemptsMade: number; opts: { attempts?: number } }): boolean {
  const max = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= max;
}

// ─── Event recording ─────────────────────────────────────────────────────────

async function recordEvent(event: {
  type: 'send' | 'deliver' | 'bounce' | 'deferred' | 'failed';
  orgId: string;
  campaignId: string;
  contactId: string;
  messageId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/events`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify(event),
    });
  } catch {
    // Non-critical — events are also logged for later replay
  }
}

async function addToSuppressionList(orgId: string, email: string, reason: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/suppressions`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, email, reason }),
    });
  } catch {
    console.error(`Failed to suppress ${email} for org ${orgId}`);
  }
}

async function updateContactStatus(
  orgId: string,
  contactId: string,
  status: 'bounced' | 'complained',
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/contacts/${contactId}/status`, {
      method: 'PATCH',
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, status }),
    });
  } catch {
    console.error(`Failed to update contact ${contactId} status to ${status}`);
  }
}

// ─── Job processor ───────────────────────────────────────────────────────────

async function processMtaSend(job: Job<MtaSendJobData>, token?: string) {
  const data = job.data;

  const recipientDomain = data.toEmail.split('@')[1] ?? 'other';
  // Receiving mailbox provider — denormalised onto each event for ISP stats.
  const isp = detectIsp(recipientDomain);
  // sendingIp '' matches the engine's default-pool key (see sendViaMta).
  const sendingIp = '';

  // Adaptive per-ISP throttle gate. When the bucket is exhausted, defer the
  // message by re-enqueuing with a delay (backpressure) instead of blasting
  // past the ISP's limit. Capped so it can't loop forever.
  const deferrals = deferralCount(data, 'throttle');
  if (deferrals < THROTTLE_MAX_DEFERRALS) {
    const throttle = await checkThrottle(data.orgId, recipientDomain, sendingIp).catch(() => null);
    if (throttle && !throttle.allowed) {
      // The bucket is a fixed window, so capacity returns when its key expires
      // — asking again before then can only get the same no. Sleep until the
      // refill (capped, so a message keeps moving even against a long window)
      // rather than polling every minute.
      const refill = await throttleRefillMs(data.orgId, throttle.isp, sendingIp).catch(
        () => THROTTLE_MAX_SLEEP_MS,
      );
      const wait = Math.min(Math.max(refill, 1_000), THROTTLE_MAX_SLEEP_MS);
      await recordEvent({
        type: 'deferred',
        orgId: data.orgId,
        campaignId: data.campaignId,
        contactId: data.contactId,
        messageId: data.messageId,
        metadata: {
          reason: 'throttle',
          isp: throttle.isp,
          deferral: deferrals + 1,
          waitMs: wait,
          attempt: job.attemptsMade,
        },
      });
      await defer(job, token, 'throttle', Date.now() + wait);
    }
  }

  const result = await sendViaMta(data);

  if (result.success) {
    const successMeta = {
      smtpCode: result.smtpCode,
      durationMs: result.durationMs,
      isp,
      ...(data.abVariantId ? { abVariantId: data.abVariantId } : {}),
    };
    // 'send' = handed off to MX; 'deliver' = MX returned SMTP 250 (this engine
    // does direct-to-MX, so the 250 IS delivery confirmation). Both are recorded
    // so deliverability/fatigue/attribution analytics that count 'deliver' work.
    await recordEvent({
      type: 'send',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: successMeta,
    });
    await recordEvent({
      type: 'deliver',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: successMeta,
    });
    return { status: 'sent', messageId: data.messageId, durationMs: result.durationMs };
  }

  // Handle failures
  const smtpCode = result.smtpCode;

  if (isBlockBounce(smtpCode, result.smtpMessage)) {
    // Block — alert but don't suppress (domain issue, not contact issue)
    await recordEvent({
      type: 'bounce',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: { bounceType: 'block', smtpCode, smtpMessage: result.smtpMessage, isp },
    });
    // Don't retry block bounces
    return { status: 'blocked', messageId: data.messageId, smtpCode };
  }

  if (isHardBounce(smtpCode)) {
    // Hard bounce — suppress email + mark contact as bounced
    await Promise.all([
      addToSuppressionList(data.orgId, data.toEmail, 'hard_bounce'),
      updateContactStatus(data.orgId, data.contactId, 'bounced'),
    ]);
    await recordEvent({
      type: 'bounce',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: { bounceType: 'hard', smtpCode, smtpMessage: result.smtpMessage, isp },
    });
    return { status: 'hard_bounce', messageId: data.messageId, smtpCode };
  }

  if (isSoftBounce(smtpCode)) {
    // 421/451 are ISP throttle signals — reduce this org+ISP's adaptive rate
    // (halved for 30 min) so subsequent sends back off.
    if (smtpCode === 421 || smtpCode === 451) {
      await recordThrottleSignal(data.orgId, detectIsp(recipientDomain), sendingIp).catch(() => {});
    }
    // A 4xx is a deferral until the retries run out. Only the last one is a
    // soft bounce; the ones before it are `deferred`, so a greylisted message
    // that gets through on attempt four leaves three deferrals and a delivery
    // instead of three bounces and a delivery.
    const final = isFinalAttempt(job);
    await recordEvent({
      type: final ? 'bounce' : 'deferred',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: {
        ...(final ? { bounceType: 'soft' } : { reason: 'soft_bounce' }),
        smtpCode,
        smtpMessage: result.smtpMessage,
        attempt: job.attemptsMade,
        attempts: job.opts.attempts,
        isp,
      },
    });
    throw new Error(`Soft bounce (${smtpCode}): ${result.smtpMessage}`);
  }

  // Warmup daily cap. The engine answers ErrAllExhausted with no SMTP code,
  // so this used to fall into the transport branch below and be retried on the
  // 31-minute ladder — six attempts against a limit that does not move until
  // midnight, then failed. The allowance resets at midnight UTC, so wait for
  // that instead. Not an error and not an attempt: a scheduled wait.
  //
  // Bounded by MAX_WARMUP_DEFERRALS so a misconfigured pool cannot park a
  // message indefinitely; two nights is already long past the point where
  // somebody should have noticed.
  if (isWarmupQuotaExhausted(result.error)) {
    const waits = deferralCount(data, 'warmup_quota');
    if (waits < MAX_WARMUP_DEFERRALS) {
      const until = nextUtcMidnight();
      await recordEvent({
        type: 'deferred',
        orgId: data.orgId,
        campaignId: data.campaignId,
        contactId: data.contactId,
        messageId: data.messageId,
        metadata: {
          reason: 'warmup_quota',
          error: result.error,
          deferral: waits + 1,
          untilIso: new Date(until).toISOString(),
          attempt: job.attemptsMade,
          isp,
        },
      });
      await defer(job, token, 'warmup_quota', until);
    }
    // Out of nights: fall through and let it be recorded as a real failure.
  }

  // Transport failure — no SMTP reply at all: a timeout, a DNS failure, an
  // unreachable host, or the engine refusing to dial. Retried like a 4xx, and
  // recorded like one: `deferred` on the way past, `failed` at the end.
  //
  // This branch used to write nothing whatsoever. Six attempts over 31 minutes
  // ended in a job marked failed and not one row in email_events, so a message
  // lost to the network was indistinguishable from one that never existed.
  await recordEvent({
    type: isFinalAttempt(job) ? 'failed' : 'deferred',
    orgId: data.orgId,
    campaignId: data.campaignId,
    contactId: data.contactId,
    messageId: data.messageId,
    metadata: {
      reason: 'transport_error',
      error: result.error,
      smtpCode,
      attempt: job.attemptsMade,
      attempts: job.opts.attempts,
      isp,
    },
  });
  throw new Error(`MTA error: ${result.error}`);
}

// ─── Workers (one per ISP queue) ─────────────────────────────────────────────

const ISP_QUEUES = [
  QUEUE_NAMES.MTA_GMAIL,
  QUEUE_NAMES.MTA_MICROSOFT,
  QUEUE_NAMES.MTA_YAHOO,
  QUEUE_NAMES.MTA_SEZNAM,
  QUEUE_NAMES.MTA_VOLNY,
  QUEUE_NAMES.MTA_CENTRUM,
  QUEUE_NAMES.MTA_OTHER,
] as const;

/**
 * Per-ISP hourly send limits per worker.
 * Mirrors RecommendedThrottle() in apps/engine/internal/email/headers.go
 * and ISP_CONFIG in apps/api/src/services/sending/isp-throttle.ts.
 *
 * Production deployments should override these via env vars (TODO).
 */
const ISP_HOURLY_LIMITS: Record<string, number> = {
  [QUEUE_NAMES.MTA_GMAIL]: 500,
  [QUEUE_NAMES.MTA_MICROSOFT]: 1000,
  [QUEUE_NAMES.MTA_YAHOO]: 500,
  [QUEUE_NAMES.MTA_SEZNAM]: 5000,
  [QUEUE_NAMES.MTA_VOLNY]: 2000,
  [QUEUE_NAMES.MTA_CENTRUM]: 2000,
  [QUEUE_NAMES.MTA_OTHER]: 1000,
};

export function startMtaSenderWorkers() {
  const workers = ISP_QUEUES.map((queueName) => {
    const worker = new Worker<MtaSendJobData>(queueName, processMtaSend, {
      connection,
      concurrency: 20,
      limiter: {
        max: ISP_HOURLY_LIMITS[queueName] ?? 1000,
        duration: 3600_000, // per hour
      },
      settings: {
        // Resolves backoff: { type: 'stream' } on the MTA queues. BullMQ passes
        // attemptsMade + 1, so the first retry arrives as 1.
        backoffStrategy: (attemptsMade, _type, _err, job) =>
          streamBackoff(attemptsMade, (job?.data as MtaSendJobData | undefined)?.stream),
      },
    });

    worker.on('completed', (job) => {
      if (job.returnvalue?.status === 'sent') {
        // Success — logged above
      }
    });

    worker.on('failed', (job, err) => {
      console.error(
        `[${queueName}] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
        err.message,
      );
      captureJobException(err, {
        queue: queueName,
        jobId: job?.id,
        jobName: job?.name,
        attempts: job?.attemptsMade,
        orgId: (job?.data as { orgId?: string } | undefined)?.orgId,
        campaignId: (job?.data as { campaignId?: string } | undefined)?.campaignId,
      });
    });

    console.log(`[${queueName}] Worker started (concurrency: 20)`);
    return worker;
  });

  return workers;
}

/**
 * Graceful shutdown: close gRPC client connection to the MTA engine.
 * Call from main process SIGTERM/SIGINT handler after workers are drained.
 */
export function shutdownMtaSender(): void {
  mtaClient.close();
}
