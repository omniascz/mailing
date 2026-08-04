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

import { Worker, Queue, type Job } from 'bullmq';
import { captureJobException } from '../lib/telemetry.js';
import { connection, QUEUE_NAMES, type MtaSendJobData } from '../queues/index.js';
import * as mtaClient from '../lib/mta-grpc-client.js';
import {
  checkThrottle,
  recordThrottleSignal,
  detectIsp,
} from '@forgemsg/shared/sending/isp-throttle';
import { internalHeaders } from '../lib/internal-api.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Adaptive-throttle backpressure: when an ISP bucket is exhausted a message is
// re-enqueued (with a delay) onto its own queue rather than dropped. Capped so
// a persistently-throttled message isn't deferred forever.
const THROTTLE_REQUEUE_DELAY_MS = 60_000;
const THROTTLE_MAX_DEFERRALS = 20; // ~20 min, then send anyway
const requeueQueues = new Map<string, Queue>();
function requeueQueue(name: string): Queue {
  let q = requeueQueues.get(name);
  if (!q) {
    q = new Queue(name, { connection });
    requeueQueues.set(name, q);
  }
  return q;
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

// ─── Event recording ─────────────────────────────────────────────────────────

async function recordEvent(event: {
  type: 'send' | 'deliver' | 'bounce' | 'fail';
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

async function processMtaSend(job: Job<MtaSendJobData>) {
  const data = job.data;

  const recipientDomain = data.toEmail.split('@')[1] ?? 'other';
  // Receiving mailbox provider — denormalised onto each event for ISP stats.
  const isp = detectIsp(recipientDomain);
  // sendingIp '' matches the engine's default-pool key (see sendViaMta).
  const sendingIp = '';

  // Adaptive per-ISP throttle gate. When the bucket is exhausted, defer the
  // message by re-enqueuing with a delay (backpressure) instead of blasting
  // past the ISP's limit. Capped so it can't loop forever.
  const deferrals = data.throttleAttempts ?? 0;
  if (deferrals < THROTTLE_MAX_DEFERRALS) {
    const throttle = await checkThrottle(data.orgId, recipientDomain, sendingIp).catch(() => null);
    if (throttle && !throttle.allowed) {
      await requeueQueue(job.queueName).add(
        job.name,
        { ...data, throttleAttempts: deferrals + 1 },
        { delay: THROTTLE_REQUEUE_DELAY_MS, priority: data.priority },
      );
      return { status: 'throttled', requeued: true, isp: throttle.isp };
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
    // Soft bounce — throw to trigger BullMQ retry
    await recordEvent({
      type: 'bounce',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: {
        bounceType: 'soft',
        smtpCode,
        smtpMessage: result.smtpMessage,
        attempt: job.attemptsMade,
        isp,
      },
    });
    throw new Error(`Soft bounce (${smtpCode}): ${result.smtpMessage}`);
  }

  // Unknown failure — also retry
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
