/**
 * WhatsApp sender worker — consumes workflow-enqueued WhatsApp jobs and sends
 * via the Meta Cloud API adapter. Mirrors viber-sender: env-configured adapter,
 * retry via BullMQ. Skips cleanly when WhatsApp isn't configured.
 *
 * Queue: whatsapp-send
 */

import { Worker, type Job } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';
import { internalHeaders } from '../lib/internal-api.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface WhatsappSendJobData {
  orgId: string;
  contactId: string;
  workflowRunId?: string;
  phone?: string;
  /** Pre-approved template name (template send). */
  templateId?: string;
  /** Free-form text (only inside the 24h customer-service window). */
  body?: string;
  language?: string;
}

/**
 * The contact's status, read where batch-sender reads it. Every job on this
 * queue comes from a campaign or a workflow, so every one is marketing.
 */
async function contactStatus(orgId: string, contactId: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/v1/internal/contacts/batch`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ orgId, contactIds: [contactId] }),
  });
  // Unknown is not consent: throw, and BullMQ retries rather than sending.
  if (!res.ok) throw new Error(`/internal/contacts/batch → ${res.status}`);
  const body = (await res.json()) as { data: { id: string; status: string | null }[] };
  return body.data.find((c) => c.id === contactId)?.status ?? null;
}

export async function processWhatsappSend(
  job: Job<WhatsappSendJobData>,
): Promise<{ messageId: string; status: string }> {
  const data = job.data;
  if (!data.phone) return { messageId: '', status: 'skipped_no_phone' };

  // A double opt-in not yet confirmed is no consent (Z143). The campaign
  // audience leaves 'pending' out; a job queued before the contact's status
  // was read there — or by a workflow — is stopped here, before the adapter.
  if ((await contactStatus(data.orgId, data.contactId)) === 'pending') {
    job.log(`contact ${data.contactId} has not confirmed the double opt-in — not sent`);
    return { messageId: '', status: 'skipped_pending' };
  }

  const { createWhatsAppAdapter } = await import('@forgemsg/shared/whatsapp/meta-adapter');
  const adapter = createWhatsAppAdapter();
  if (!adapter) {
    job.log(
      'WhatsApp not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN) — skipping',
    );
    return { messageId: '', status: 'skipped_unconfigured' };
  }

  // Template send when a template is given; otherwise a free-form text reply.
  if (data.templateId) {
    const result = await adapter.send(
      {
        channel: 'whatsapp',
        orgId: data.orgId,
        content: {
          kind: 'whatsapp',
          templateId: data.templateId,
          language: data.language,
          parameters: {},
        },
      },
      { contactId: data.contactId, phone: data.phone },
    );
    return { messageId: result.messageId, status: result.status };
  }

  if (data.body) {
    const result = await adapter.sendText(data.phone, data.body, data.contactId);
    return { messageId: result.messageId, status: result.status };
  }

  return { messageId: '', status: 'skipped_empty' };
}

export function startWhatsappSenderWorker() {
  const worker = new Worker<WhatsappSendJobData>(QUEUE_NAMES.WHATSAPP_SEND, processWhatsappSend, {
    connection,
    concurrency: 10,
    limiter: { max: 80, duration: 1000 },
  });

  worker.on('failed', (job, err) => {
    console.error(`[whatsapp-sender] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.WHATSAPP_SEND });
  });

  return worker;
}
