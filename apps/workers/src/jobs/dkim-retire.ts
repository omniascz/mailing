/**
 * DKIM key retirement cron.
 * Runs daily; calls the internal API to move retiring keys past their grace to
 * retired, and to sweep pending keys the customer never published.
 */

import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

const dkimRetireQueue = new Queue(QUEUE_NAMES.DKIM_RETIRE, { connection });

export function startDkimRetireWorker() {
  const worker = new Worker(
    QUEUE_NAMES.DKIM_RETIRE,
    async (job) => {
      const res = await fetch(`${API_BASE}/api/v1/internal/dkim/retire-expired`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`DKIM retire failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as { data: { retired: number; pendingExpired: number } };
      job.log(
        `DKIM retire: ${data.data.retired} retired, ${data.data.pendingExpired} pending swept`,
      );
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error('[dkim-retire] job failed', job?.id, err.message);
  });

  return worker;
}

export async function scheduleDkimRetire() {
  const jobId = 'daily-dkim-retire';
  const existing = await dkimRetireQueue.getJob(jobId);
  if (!existing) {
    await dkimRetireQueue.add(
      'retire-expired',
      {},
      {
        jobId,
        repeat: { pattern: '20 1 * * *' }, // 01:20 UTC daily
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
  }
}
