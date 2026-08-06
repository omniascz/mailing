/**
 * External feed poll worker (#286).
 * Runs hourly; calls the internal API to poll all due external feeds.
 */

import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

const feedPollQueue = new Queue(QUEUE_NAMES.EXTERNAL_FEED_POLL, { connection });

export function startExternalFeedPollWorker() {
  const worker = new Worker(
    QUEUE_NAMES.EXTERNAL_FEED_POLL,
    async (job) => {
      const res = await fetch(`${API_BASE}/api/v1/internal/external-feeds/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`External feed poll failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as {
        results?: Array<{ feedId: string; itemsProcessed: number }>;
      };
      const total = data.results?.reduce((acc, r) => acc + r.itemsProcessed, 0) ?? 0;
      job.log(`External feed poll complete: ${data.results?.length ?? 0} feeds, ${total} items`);
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error('[external-feed-poll] job failed', job?.id, err.message);
  });

  return worker;
}

export async function scheduleExternalFeedPoll() {
  const jobId = 'hourly-external-feed-poll';
  const existing = await feedPollQueue.getJob(jobId);
  if (!existing) {
    await feedPollQueue.add(
      'poll-due-feeds',
      {},
      {
        jobId,
        repeat: { pattern: '0 * * * *' }, // every hour
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[external-feed-poll] Hourly job scheduled');
  }
}
