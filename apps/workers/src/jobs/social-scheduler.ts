/**
 * Social post scheduler (#294) — dispatches due scheduled posts every minute,
 * and runs social monitoring poll every 15 minutes.
 */

import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

const socialPublishQueue = new Queue(QUEUE_NAMES.SOCIAL_PUBLISH, { connection });
const socialMonitorQueue = new Queue(QUEUE_NAMES.SOCIAL_MONITOR, { connection });

async function callInternal(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
  });
  if (!res.ok) throw new Error(`Internal call failed: ${res.status} ${path}`);
  return res.json();
}

export function startSocialSchedulerWorker() {
  const publishWorker = new Worker(
    QUEUE_NAMES.SOCIAL_PUBLISH,
    async (job) => {
      const result = await callInternal('/api/v1/internal/social/dispatch-due');
      job.log(`Dispatched: ${JSON.stringify(result)}`);
    },
    { connection, concurrency: 1 },
  );

  const monitorWorker = new Worker(
    QUEUE_NAMES.SOCIAL_MONITOR,
    async (job) => {
      const result = await callInternal('/api/v1/internal/social/monitor-poll');
      job.log(`Monitoring poll: ${JSON.stringify(result)}`);
    },
    { connection, concurrency: 1 },
  );

  publishWorker.on('failed', (job, err) =>
    console.error('[social-publish] failed', job?.id, err.message),
  );
  monitorWorker.on('failed', (job, err) =>
    console.error('[social-monitor] failed', job?.id, err.message),
  );

  return { publishWorker, monitorWorker };
}

export async function scheduleSocialJobs() {
  const existing = await socialPublishQueue.getRepeatableJobs();
  if (!existing.find((j) => j.name === 'dispatch-due-posts')) {
    await socialPublishQueue.add(
      'dispatch-due-posts',
      {},
      {
        repeat: { pattern: '* * * * *' }, // every minute
        removeOnComplete: true,
      },
    );
  }
  if (!existing.find((j) => j.name === 'monitor-poll')) {
    await socialMonitorQueue.add(
      'monitor-poll',
      {},
      {
        repeat: { pattern: '*/15 * * * *' }, // every 15 min
        removeOnComplete: true,
      },
    );
  }
  console.log('[social-scheduler] Jobs scheduled');
}
