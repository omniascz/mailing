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

async function processWhatsappSend(
  job: Job<WhatsappSendJobData>,
): Promise<{ messageId: string; status: string }> {
  const data = job.data;
  if (!data.phone) return { messageId: '', status: 'skipped_no_phone' };

  const { createWhatsAppAdapter } =
    await import('../../../api/src/channels/whatsapp/meta-adapter.js');
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
