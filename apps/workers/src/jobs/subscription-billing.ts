/**
 * Subscription billing worker (#313).
 *
 * Every 5 minutes, calls the internal API to generate invoices for
 * subscriptions whose `next_invoice_at` has elapsed. The API advances each
 * subscription's period window.
 *
 * ─── Why this is not the backlog hazard it looks like ────────────────────────
 *
 * This worker is NOT behind FEATURE_BEYOND_CORE, but the route it posts to,
 * `/api/v1/internal/subscriptions/generate-due`, lives in
 * commerceSubscriptionRoutes, which is. So in production the job has been
 * failing on 404 since it shipped, and `next_invoice_at` has never advanced.
 * The obvious reading is that turning the flag on releases a backlog:
 * `runDueInvoiceGeneration(500)` fires, 500 invoices per tick, every five
 * minutes, unattended.
 *
 * Measured before believing it, and the reading is wrong on three counts.
 *
 *   1. There are no subscriptions. `subscriptions` is empty in all three local
 *      databases (dev, itest, itest2), and it has to be: the ONLY producer of a
 *      row is POST /api/v1/commerce/subscriptions, in the same flagged plugin
 *      as the consumer. Nothing can have accumulated while the flag was off,
 *      because nothing could be created while the flag was off.
 *
 *   2. A stale subscription cannot burst anyway. `generateNextInvoice` advances
 *      `next_invoice_at` by exactly ONE period per call, to
 *      `currentPeriodEnd` — not to now. A subscription N periods behind needs N
 *      ticks. The 500 is a per-tick cap on how many DISTINCT subscriptions are
 *      looked at, not a depth.
 *
 *   3. Nothing leaves the building. `createInvoice` inserts one row with
 *      status 'draft'. No mail, no Stripe call, no external request. Sending is
 *      `sendInvoice`, reachable only from the authenticated
 *      POST /api/v1/commerce/invoices/:id/send — a human action. And both
 *      downstream sweeps filter on `status = 'sent'`: markOverdueInvoices never
 *      touches a draft, and sendDueReminders never fires an `invoice_reminder`
 *      workflow event for one.
 *
 * So the first successful tick generates zero invoices, and the steady state is
 * one draft per subscription per billing period. No backfill, no lowered cap
 * and no manual gate — all three would be machinery for a condition that cannot
 * arise. Point 2 is the load-bearing one and it is easy to destroy by
 * "optimising" the per-subscription loop into a catch-up while-loop, so it is
 * pinned by a test: see
 * apps/api/src/integration/subscription-billing.integration.test.ts.
 */

import { Worker } from 'bullmq';
import { connection, cronQueue, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

const billingQueue = cronQueue(QUEUE_NAMES.SUBSCRIPTION_BILLING);

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
