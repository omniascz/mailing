/**
 * Subscription billing worker (#313).
 *
 * Every 5 minutes, calls the internal API to generate invoices for
 * subscriptions whose `next_invoice_at` has elapsed. The API advances each
 * subscription's period window and enqueues delivery via the invoice flow.
 */

import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? process.env.INTERNAL_SECRET ?? '';

const billingQueue = new Queue(QUEUE_NAMES.SUBSCRIPTION_BILLING, { connection });

async function generateDue(): Promise<{ processed: number; generated: number; errors: number }> {
  const res = await fetch(`${API_BASE}/api/v1/internal/subscriptions/generate-due`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({ limit: 500 }),
  });
  if (!res.ok) throw new Error(`generate-due failed ${res.status}`);
  const j = (await res.json()) as {
    data: { processed: number; generated: number; errors: number };
  };
  return j.data;
}

export function startSubscriptionBillingWorker() {
  const worker = new Worker(
    QUEUE_NAMES.SUBSCRIPTION_BILLING,
    async (job) => {
      const result = await generateDue();
      job.log(`subscription billing: ${JSON.stringify(result)}`);
      return result;
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) =>
    console.error('[subscription-billing] failed', job?.id, err.message),
  );

  return worker;
}

export async function scheduleSubscriptionBillingJob() {
  const existing = await billingQueue.getRepeatableJobs();
  if (!existing.find((j) => j.name === 'subscription-billing-tick')) {
    await billingQueue.add(
      'subscription-billing-tick',
      {},
      {
        repeat: { pattern: '*/5 * * * *' }, // every 5 minutes
        removeOnComplete: true,
      },
    );
  }
  console.log('[subscription-billing] cron scheduled every 5 minutes');
}
