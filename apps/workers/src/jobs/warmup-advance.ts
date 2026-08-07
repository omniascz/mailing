/**
 * IP warmup day advancement cron (#485).
 * Runs once per day at 00:05 UTC; calls the internal API to advance
 * all actively warming IPs by one day.
 */

import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

const warmupAdvanceQueue = new Queue(QUEUE_NAMES.WARMUP_ADVANCE, { connection });

export function startWarmupAdvanceWorker() {
  const worker = new Worker(
    QUEUE_NAMES.WARMUP_ADVANCE,
    async (job) => {
      const res = await fetch(`${API_BASE}/api/v1/internal/sending/warmup/advance-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Warmup advance failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as {
        data: { total: number; advanced: number; failed: number };
      };
      job.log(
        `Warmup advance: ${data.data.advanced}/${data.data.total} IPs advanced, ${data.data.failed} failed`,
      );
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error('[warmup-advance] job failed', job?.id, err.message);
  });

  return worker;
}

export async function scheduleWarmupAdvance() {
  const jobId = 'daily-warmup-advance';
  const existing = await warmupAdvanceQueue.getJob(jobId);
  if (!existing) {
    await warmupAdvanceQueue.add(
      'advance-all-ips',
      {},
      {
        jobId,
        repeat: { pattern: '5 0 * * *' }, // 00:05 UTC daily
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[warmup-advance] Daily job scheduled (00:05 UTC)');
  }
}
