/**
 * Anomaly detector recurring job (§9 P1).
 *
 * Calls the API's internal scan endpoint every 5 minutes. The endpoint
 * walks every campaign in `sending` status, checks 1h rolling bounce +
 * complaint rates, auto-pauses offenders, and posts a status-page
 * incident.
 *
 * We could call services/deliverability/anomaly-detector directly
 * from this worker, but going through the API keeps the DB connection
 * pool centralised in apps/api and matches the seo-rank-poll + invoice
 * reminder patterns already in place.
 */

import { Worker } from 'bullmq';
import { connection, cronQueue, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

const anomalyQueue = cronQueue(QUEUE_NAMES.ANOMALY_DETECTOR);

export function startAnomalyDetectorWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.ANOMALY_DETECTOR,
    async (job) => {
      const res = await fetch(`${API_BASE}/api/v1/internal/anomaly-detector/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Anomaly scan failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as {
        data?: { scanned?: number; paused?: number };
      };
      const scanned = data.data?.scanned ?? 0;
      const paused = data.data?.paused ?? 0;
      job.log(`anomaly scan ok — scanned=${scanned} paused=${paused}`);
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error('[anomaly-detector] job failed', job?.id, err.message);
  });

  return worker;
}

/**
 * Register a recurring job firing every 5 minutes. Idempotent — calling
 * twice produces a single job because we pin `jobId` and BullMQ dedupes.
 */
export async function scheduleAnomalyDetector(): Promise<void> {
  const jobId = 'anomaly-detector-5min';
  const existing = await anomalyQueue.getJob(jobId);
  if (existing) return;

  await anomalyQueue.add(
    'scan-active-campaigns',
    {},
    {
      jobId,
      repeat: { pattern: '*/5 * * * *' },
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
    },
  );
}
