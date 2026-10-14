/**
 * Push sender worker — consumes workflow-enqueued Web Push / in-app jobs and
 * sends via the per-org WebPushAdapter (VAPID keys are per-org). The adapter
 * looks up the contact's active push subscription itself. Skips cleanly when
 * the org has no VAPID keys.
 *
 * Queue: push-send
 */

import { Worker, type Job } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';
import { marketingSkip } from '../lib/contact-status.js';

export interface PushSendJobData {
  orgId: string;
  contactId: string;
  workflowRunId?: string;
  title?: string;
  body?: string;
  url?: string;
}

async function processPushSend(
  job: Job<PushSendJobData>,
): Promise<{ messageId: string; status: string }> {
  const data = job.data;
  if (!data.title && !data.body) return { messageId: '', status: 'skipped_empty' };

  // Campaign and flow push only, so marketing: a contact who refuses it, is
  // pending, or is not found / deleted gets none (Michal, 13. 10. — "no
  // channel"; a flow is marketing; roadmap point 1 for a deleted contact). On
  // master a flow pushed to a deleted contact (Z154). Checked before the
  // adapter; an HTTP error throws and BullMQ retries. Z155.
  const skip = await marketingSkip(data.orgId, data.contactId);
  if (skip) {
    job.log(`contact ${data.contactId}: ${skip} — not sent`);
    return { messageId: '', status: skip };
  }

  const { getPushAdapterForOrg } = await import('@forgemsg/api/services/push/get-adapter');
  const adapter = await getPushAdapterForOrg(data.orgId);
  if (!adapter) {
    job.log('No active VAPID keys for org — skipping push');
    return { messageId: '', status: 'skipped_unconfigured' };
  }

  try {
    const result = await adapter.send(
      {
        channel: 'push',
        orgId: data.orgId,
        content: {
          kind: 'push',
          title: data.title ?? '',
          body: data.body ?? '',
          url: data.url,
        },
      },
      { contactId: data.contactId },
    );
    return { messageId: result.messageId, status: result.status };
  } catch (err) {
    // No active subscription is a normal skip, not a failure.
    job.log(`push send skipped/failed: ${(err as Error).message}`);
    return { messageId: '', status: 'skipped_no_subscription' };
  }
}

export function startPushSenderWorker() {
  const worker = new Worker<PushSendJobData>(QUEUE_NAMES.PUSH_SEND, processPushSend, {
    connection,
    concurrency: 20,
    limiter: { max: 200, duration: 1000 },
  });

  worker.on('failed', (job, err) => {
    console.error(`[push-sender] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.PUSH_SEND });
  });

  return worker;
}
