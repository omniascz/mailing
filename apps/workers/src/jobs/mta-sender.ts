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
import {
  connection,
  QUEUE_NAMES,
  type MtaSendJobData,
} from '../queues/index.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// ─── MTA Client (HTTP fallback when gRPC client isn't available) ─────────────

interface MtaSendResult {
  success: boolean;
  messageId: string;
  smtpCode: number;
  smtpMessage: string;
  error: string;
  durationMs: number;
}

/**
 * Send an email via the MTA engine.
 *
 * In production this uses a gRPC client; for initial integration we use
 * an HTTP bridge endpoint on the MTA (or the internal API forwards to MTA).
 */
async function sendViaMta(data: MtaSendJobData): Promise<MtaSendResult> {
  // gRPC client call — in production, use @grpc/grpc-js with the proto definition.
  // For now, use the internal API bridge.
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/mta/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
        dkim: data.dkimDomain
          ? {
              domain: data.dkimDomain,
              selector: data.dkimSelector,
              privateKeyPem: data.dkimPrivateKey,
            }
          : undefined,
        orgId: data.orgId,
        campaignId: data.campaignId,
        contactId: data.contactId,
      }),
    });

    if (!res.ok) {
      return {
        success: false,
        messageId: data.messageId,
        smtpCode: 0,
        smtpMessage: '',
        error: `MTA HTTP ${res.status}`,
        durationMs: 0,
      };
    }

    return (await res.json()) as MtaSendResult;
  } catch (err) {
    return {
      success: false,
      messageId: data.messageId,
      smtpCode: 0,
      smtpMessage: '',
      error: `MTA connection error: ${(err as Error).message}`,
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
  type: 'send' | 'bounce' | 'fail';
  orgId: string;
  campaignId: string;
  contactId: string;
  messageId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, email, reason }),
    });
  } catch {
    console.error(`Failed to suppress ${email} for org ${orgId}`);
  }
}

// ─── Job processor ───────────────────────────────────────────────────────────

async function processMtaSend(job: Job<MtaSendJobData>) {
  const data = job.data;

  const result = await sendViaMta(data);

  if (result.success) {
    await recordEvent({
      type: 'send',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: { smtpCode: result.smtpCode, durationMs: result.durationMs },
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
      metadata: { bounceType: 'block', smtpCode, smtpMessage: result.smtpMessage },
    });
    // Don't retry block bounces
    return { status: 'blocked', messageId: data.messageId, smtpCode };
  }

  if (isHardBounce(smtpCode)) {
    // Hard bounce — suppress contact
    await addToSuppressionList(data.orgId, data.toEmail, 'hard_bounce');
    await recordEvent({
      type: 'bounce',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: { bounceType: 'hard', smtpCode, smtpMessage: result.smtpMessage },
    });
    return { status: 'hard_bounce', messageId: data.messageId, smtpCode };
  }

  if (isSoftBounce(smtpCode)) {
    // Soft bounce — throw to trigger BullMQ retry
    await recordEvent({
      type: 'bounce',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: data.contactId,
      messageId: data.messageId,
      metadata: { bounceType: 'soft', smtpCode, smtpMessage: result.smtpMessage, attempt: job.attemptsMade },
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
  QUEUE_NAMES.MTA_OTHER,
] as const;

export function startMtaSenderWorkers() {
  const workers = ISP_QUEUES.map((queueName) => {
    const worker = new Worker<MtaSendJobData>(queueName, processMtaSend, {
      connection,
      concurrency: 20,
      limiter: {
        max: queueName === QUEUE_NAMES.MTA_GMAIL ? 500 : 1000,
        duration: 3600_000, // per hour
      },
    });

    worker.on('completed', (job) => {
      if (job.returnvalue?.status === 'sent') {
        // Success — logged above
      }
    });

    worker.on('failed', (job, err) => {
      console.error(`[${queueName}] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
    });

    console.log(`[${queueName}] Worker started (concurrency: 20)`);
    return worker;
  });

  return workers;
}
