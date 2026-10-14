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
import { marketingSkip } from '../lib/contact-status.js';

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

  // Campaign push only, so marketing: a contact who refuses it, is pending, or
  // is not found / deleted gets none (Michal, 13. 10. — "no channel"; roadmap
  // point 1 for a deleted contact). Checked before the service touches a
  // device; an HTTP error throws and BullMQ retries. Z155.
  const skip = await marketingSkip(d.orgId, d.contactId);
  if (skip) {
    job.log(`contact ${d.contactId}: ${skip} — not sent`);
    return { status: skip };
  }

  const { sendContactMobilePush } = await import('@forgemsg/api/services/push/mobile');
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
