/**
 * SEO rank-tracking scheduled worker (#292).
 * Runs once per day; fetches SERP positions for all active tracked keywords
 * via the API's internal endpoint (to avoid cross-package imports).
 */

import { Worker } from 'bullmq';
import { connection, cronQueue, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

const rankPollQueue = cronQueue(QUEUE_NAMES.SEO_RANK_POLL);

export function startSeoRankPollWorker() {
  const worker = new Worker(
    QUEUE_NAMES.SEO_RANK_POLL,
    async (job) => {
      const { orgId } = job.data as { orgId?: string };

      const url = orgId
        ? `${API_BASE}/api/v1/internal/seo/rank-poll?orgId=${orgId}`
        : `${API_BASE}/api/v1/internal/seo/rank-poll`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`SEO rank poll failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      job.log(`Rank poll complete: ${JSON.stringify(data)}`);
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error('[seo-rank-poll] job failed', job?.id, err.message);
  });

  return worker;
}

// ── Schedule daily poll at 06:00 UTC ─────────────────────────────────────────

export async function scheduleRankPoll() {
  const jobId = 'daily-rank-poll';
  const existing = await rankPollQueue.getJob(jobId);
  if (!existing) {
    await rankPollQueue.add(
      'poll-all-orgs',
      {},
      {
        jobId,
        repeat: { pattern: '0 6 * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[seo-rank-poll] Daily job scheduled (06:00 UTC)');
  }
}
