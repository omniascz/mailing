/**
 * Blacklist monitor BullMQ worker.
 *
 * Runs on a repeatable schedule (every 6 hours by default).
 * Queries /api/v1/internal/blacklist-check which calls
 * the deliverability/blacklist-monitor service to check all
 * dedicated IPs against major DNSBL zones.
 *
 * Also handles one-off per-IP check jobs triggered by the operator.
 */

import { Worker, Queue, type Job } from 'bullmq';
import { captureJobException } from '../lib/telemetry.js';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

export interface BlacklistMonitorJobData {
  /** undefined = check all IPs; set to check a specific IP address only */
  ipAddress?: string;
  /** BullMQ repeat job key */
  repeat?: boolean;
}

export const blacklistMonitorQueue = new Queue<BlacklistMonitorJobData>(
  QUEUE_NAMES.BLACKLIST_MONITOR,
  { connection },
);

async function processBlacklistMonitor(job: Job<BlacklistMonitorJobData>) {
  const { ipAddress } = job.data;
  job.log(`[blacklist-monitor] Checking ${ipAddress ?? 'all IPs'}`);

  const path = ipAddress
    ? `/api/v1/internal/blacklist-check?ip=${encodeURIComponent(ipAddress)}`
    : '/api/v1/internal/blacklist-check';

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Blacklist check failed ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    data: { checked: number; listed: number; details: unknown[] };
  };
  const { checked, listed } = body.data;

  job.log(`[blacklist-monitor] Done — checked ${checked} IPs, ${listed} listed`);

  if (listed > 0) {
    console.warn(
      `[blacklist-monitor] ⚠️  ${listed}/${checked} IPs are blacklisted — investigate immediately`,
    );
  }

  return { checked, listed };
}

/** Schedule a repeatable check every 6 hours. Call once on worker boot. */
export async function scheduleBlacklistMonitor() {
  await blacklistMonitorQueue.add(
    'blacklist-check-all',
    { repeat: true },
    {
      jobId: 'blacklist-monitor-repeat',
      repeat: { every: 6 * 60 * 60 * 1000 }, // 6 hours
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 5 },
    },
  );
}

export function startBlacklistMonitorWorker() {
  const worker = new Worker<BlacklistMonitorJobData>(
    QUEUE_NAMES.BLACKLIST_MONITOR,
    processBlacklistMonitor,
    {
      connection,
      concurrency: 1, // sequential — DNS queries are I/O-bound, not CPU-bound
    },
  );

  worker.on('completed', (job) => {
    console.log(`[blacklist-monitor] Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[blacklist-monitor] Job ${job?.id} failed:`, err.message);
    captureJobException(err, {
      queue: QUEUE_NAMES.BLACKLIST_MONITOR,
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
    });
  });

  return worker;
}
