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
import { viberSendJobSchema } from '@forgemsg/api/lib/queue-contracts';
import type { z } from 'zod';

/**
 * The job shape, derived from the contract rather than restated beside it.
 *
 * This used to be a hand-written interface, which TypeScript erases: `phone`
 * and `type` were declared required and two producers shipped neither, so the
 * adapter was handed `undefined` for the recipient and for the content
 * discriminator. A type that is not checked at runtime does not make a queue
 * safe — the schema does.
 */
export type ViberSendJobData = z.infer<typeof viberSendJobSchema>;

async function processViberSend(
  job: Job<ViberSendJobData>,
): Promise<{ messageId: string; status: string }> {
  // Parse, don't trust. A malformed job fails here with the offending field
  // named, instead of reaching the provider as a message to nobody.
  const data = viberSendJobSchema.parse(job.data);
  job.log(`Viber send to ${data.phone} (contact ${data.contactId}) org=${data.orgId}`);

  // Dynamically import to avoid loading the adapter in the worker bootstrap
  const { createViberAdapter } = await import('@forgemsg/shared/viber/adapter');

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
