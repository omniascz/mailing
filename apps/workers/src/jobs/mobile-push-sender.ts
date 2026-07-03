/**
 * Mobile push sender worker — consumes native-push jobs (bulk push campaigns +
 * workflow send_push to devices) and delivers via APNs/FCM. Mirrors
 * whatsapp-sender: cross-imports the API service, retries via BullMQ, and skips
 * cleanly when APNs/FCM credentials aren't configured (the service records the
 * device as skipped rather than failing).
 *
 * Queue: mobile-push-send
 */

import { Worker, type Job } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

export interface MobilePushJobData {
  orgId: string;
  contactId: string;
  title?: string;
  body?: string;
  url?: string;
  campaignId?: string;
}

async function processMobilePush(job: Job<MobilePushJobData>) {
  const d = job.data;
  if (!d.title && !d.body) return { skipped: 'empty' };

  const { sendContactMobilePush } = await import('../../../api/src/services/push/mobile.js');
  const summary = await sendContactMobilePush(
    d.orgId,
    d.contactId,
    { title: d.title ?? '', body: d.body ?? '', url: d.url },
    d.campaignId,
  );
  return summary;
}

export function startMobilePushSenderWorker() {
  const worker = new Worker<MobilePushJobData>(QUEUE_NAMES.MOBILE_PUSH_SEND, processMobilePush, {
    connection,
    concurrency: 20,
    limiter: { max: 200, duration: 1000 },
  });

  worker.on('failed', (job, err) => {
    console.error(`[mobile-push-sender] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.MOBILE_PUSH_SEND });
  });

  return worker;
}
