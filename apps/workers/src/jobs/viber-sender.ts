/**
 * Viber sender worker — processes async Viber message send jobs.
 *
 * Queue: viber-send
 * Job data: ViberSendJobData
 *
 * Handles retry (3 attempts, exponential backoff) and DLR status updates.
 */

import { Worker, type Job } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

export interface ViberSendJobData {
  orgId: string;
  contactId: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  /** Viber message content */
  body: string;
  type: 'text' | 'picture' | 'video' | 'file' | 'action';
  mediaUrl?: string;
  actionUrl?: string;
  actionText?: string;
  sender?: string;
  ttl?: number;
  /** Optional correlation: campaign or workflow action ID */
  campaignId?: string;
  workflowRunId?: string;
  templateId?: string;
  /** Provider override — if absent, uses VIBER_PROVIDER env var */
  provider?: 'infobip' | 'rakuten' | 'messagebird';
}

async function processViberSend(job: Job<ViberSendJobData>): Promise<{ messageId: string; status: string }> {
  const data = job.data;
  job.log(`Viber send to ${data.phone} (contact ${data.contactId}) org=${data.orgId}`);

  // Dynamically import to avoid loading the adapter in the worker bootstrap
  const { createViberAdapter } = await import(
    '../../../api/src/services/viber/adapter.js'
  );

  const adapter = createViberAdapter();
  const result = await adapter.send(
    {
      channel: 'viber',
      orgId: data.orgId,
      content: {
        kind: 'viber',
        type: data.type,
        body: data.body,
        mediaUrl: data.mediaUrl,
        actionUrl: data.actionUrl,
        actionText: data.actionText,
        sender: data.sender,
        ttl: data.ttl,
        templateName: data.templateId,
      },
    },
    {
      contactId: data.contactId,
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
    },
  );

  job.log(`Viber sent: messageId=${result.messageId} status=${result.status}`);
  return { messageId: result.messageId, status: result.status };
}

export function startViberSenderWorker() {
  const worker = new Worker<ViberSendJobData>(QUEUE_NAMES.VIBER_SEND, processViberSend, {
    connection,
    concurrency: 20, // Infobip supports high concurrency
    limiter: {
      max: 100,
      duration: 1000, // 100 msgs/sec max
    },
  });

  worker.on('completed', (job, result) => {
    console.log(`[viber-sender] ${job.id} completed: ${result.messageId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[viber-sender] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: 'viber-send' });
  });

  return worker;
}
