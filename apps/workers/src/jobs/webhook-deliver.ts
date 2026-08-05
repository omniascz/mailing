/**
 * Outgoing webhook delivery worker.
 *
 * dispatchEvent has been writing webhook_deliveries rows and enqueuing
 * `webhook-deliver` jobs since the feature was built. Nothing consumed them:
 * `webhook` was not in QUEUE_NAMES and no Worker was ever constructed for it,
 * so every outgoing webhook this product has ever produced sat in Redis. This
 * is the missing consumer.
 *
 * Follows the invoice-reminder shape: the worker owns no database access, it
 * POSTs to /api/v1/internal/webhooks/* with the shared secret and lets the API
 * do the writing.
 *
 * ─── Retry ──────────────────────────────────────────────────────────────────
 *
 * BullMQ owns it, entirely. The queue is configured with attempts 5 and
 * exponential backoff from 30 s, which gives 30/60/120/240 s between tries.
 * The API answers 502 when an attempt should be repeated; callInternal turns a
 * non-2xx into a throw, and a thrown job is how BullMQ is asked to reschedule.
 *
 * There is deliberately no second mechanism. deliverWebhook used to compute a
 * `nextRetryAt` and set status 'retrying', with processRetryQueue meant to
 * pick those rows back up — except processRetryQueue had no caller, so a
 * delivery that failed once stayed 'retrying' permanently. Both are gone.
 */

import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? process.env.INTERNAL_SECRET ?? '';

export interface WebhookDeliverJobData {
  deliveryId: string;
}

async function callInternal(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Internal call failed: ${res.status} ${path} ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Concurrency 16.
 *
 * Every job is one HTTP request to somebody else's server with a 15 s timeout,
 * so a worker slot is almost entirely idle wall-clock, not CPU. At
 * concurrency 1 a single receiver that always times out would hold the only
 * slot for 15 s per attempt — 5 attempts each — and every other organisation's
 * events would queue behind it. That is a cross-tenant outage caused by one
 * tenant's broken endpoint.
 *
 * 16 is chosen from the timeout rather than from core count: in the worst case
 * (all slots blocked on the full 15 s) the queue still drains at ~1 delivery
 * per second, which is above the rate dispatchEvent can realistically produce
 * for a single org. It is also low enough that a fan-out to many receivers
 * cannot exhaust the process's socket budget.
 *
 * Overridable so an operator can tune it without a deploy.
 */
const CONCURRENCY = Number(process.env.WEBHOOK_WORKER_CONCURRENCY ?? 16);

export function startWebhookDeliverWorker() {
  const worker = new Worker<WebhookDeliverJobData>(
    QUEUE_NAMES.WEBHOOK,
    async (job) => {
      const { deliveryId } = job.data;
      if (!deliveryId) throw new Error('webhook-deliver job has no deliveryId');

      const result = (await callInternal('/api/v1/internal/webhooks/deliver', {
        deliveryId,
      })) as { data?: { outcome?: string; statusCode?: number } };

      const outcome = result?.data?.outcome ?? 'unknown';
      job.log(`delivery ${deliveryId}: ${outcome} (HTTP ${result?.data?.statusCode ?? '-'})`);
      return result?.data;
    },
    { connection, concurrency: CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    const deliveryId = job?.data?.deliveryId;
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;

    // Every failed attempt lands here, including the ones that will be retried.
    // Only the last one is terminal, and only the last one may mark the row
    // failed — doing it earlier would count a webhook towards auto-disable for
    // a blip it later recovered from.
    if (attemptsMade < maxAttempts) {
      console.warn(
        `[webhook-deliver] attempt ${attemptsMade}/${maxAttempts} failed for ${deliveryId}: ${err.message}`,
      );
      return;
    }

    console.error(
      `[webhook-deliver] giving up on ${deliveryId} after ${attemptsMade} attempts: ${err.message}`,
    );
    if (!deliveryId) return;
    void callInternal('/api/v1/internal/webhooks/exhausted', {
      deliveryId,
      reason: err.message.slice(0, 2000),
      attempts: attemptsMade,
    }).catch((e: Error) => {
      // Nothing above this to catch it. Loud, because the row is now stuck in
      // 'pending' and the auto-disable counter did not move.
      console.error(`[webhook-deliver] could not record exhaustion for ${deliveryId}:`, e.message);
    });
  });

  return worker;
}
