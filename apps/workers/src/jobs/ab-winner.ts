/**
 * A/B winner dispatcher worker.
 *
 * Flow (called after testDurationHours elapses via delayed BullMQ job):
 *   1. POST /api/v1/internal/campaigns/:id/ab-winner-compute
 *      → compute winner via z-test, get winning variant info
 *   2. If autoSendWinner=false or holdback=0 → log + exit
 *   3. GET /api/v1/internal/campaigns/:id/ab-holdback (paginated)
 *      → load holdback contact IDs
 *   4. For each page of contacts, enqueue batch-sender jobs with winner content
 *   5. POST /api/v1/internal/campaigns/:id/ab-winner-dispatched
 *      → mark dispatch complete
 */

import { Worker, type Job } from 'bullmq';
import { captureJobException } from '../lib/telemetry.js';
import {
  connection,
  QUEUE_NAMES,
  batchSenderQueue,
  PRIORITY,
  type AbWinnerJobData,
  type BatchSenderJobData,
} from '../queues/index.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';
const BATCH_SIZE = 1000;

interface WinnerComputeResult {
  winnerVariantId: string;
  metric: string;
  confidencePct: number;
  rankings: Array<{
    variantId: string;
    subject: string;
    content: Record<string, unknown>;
    preheader?: string;
    sent: number;
    score: number;
  }>;
  autoSendWinner: boolean;
}

async function internalPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return ((await res.json()) as { data: T }).data;
}

async function internalGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString();
  const url = `${API_URL}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: { 'x-internal-secret': INTERNAL_SECRET },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return ((await res.json()) as { data: T }).data;
}

async function processAbWinner(job: Job<AbWinnerJobData>) {
  const { campaignId, orgId } = job.data;
  job.log(`[ab-winner] Campaign ${campaignId} — computing winner`);

  // 1. Compute winner
  const result = await internalPost<WinnerComputeResult>(
    `/api/v1/internal/campaigns/${campaignId}/ab-winner-compute`,
    { orgId },
  );

  job.log(
    `[ab-winner] Winner: ${result.winnerVariantId} ` +
      `(${result.metric}, confidence ${result.confidencePct.toFixed(1)}%)`,
  );

  if (!result.autoSendWinner) {
    job.log('[ab-winner] autoSendWinner=false — skipping holdback dispatch');
    return { dispatched: 0 };
  }

  // Resolve winning variant details from rankings
  const winner = result.rankings.find((r) => r.variantId === result.winnerVariantId);
  if (!winner) {
    job.log('[ab-winner] Winner variant not found in rankings — skipping dispatch');
    return { dispatched: 0 };
  }

  const { fromName, fromEmail, replyTo, dkimDomain, dkimSelector, dkimPrivateKey, priority } =
    job.data;

  // 2. Paginate holdback contacts and enqueue batch-sender jobs
  let cursor: string | undefined;
  let totalDispatched = 0;
  let batchIndex = 0;

  do {
    const query: Record<string, string> = { limit: String(BATCH_SIZE) };
    if (cursor) query.cursor = cursor;

    const page = await internalGet<{ contactIds: string[]; nextCursor: string | null }>(
      `/api/v1/internal/campaigns/${campaignId}/ab-holdback`,
      query,
    );

    if (page.contactIds.length === 0) break;

    // Split into batch-sender chunks (each chunk = one job)
    const chunks: string[][] = [];
    for (let i = 0; i < page.contactIds.length; i += BATCH_SIZE) {
      chunks.push(page.contactIds.slice(i, i + BATCH_SIZE));
    }

    const jobs = chunks.map((batch, idx) => ({
      name: `ab-winner-${campaignId}-${batchIndex + idx}`,
      data: {
        campaignId,
        orgId,
        batchIndex: batchIndex + idx,
        contactIds: batch,
        content: winner.content,
        subject: winner.subject,
        preheader: winner.preheader ?? '',
        fromName: fromName ?? '',
        fromEmail: fromEmail ?? '',
        replyTo: replyTo ?? '',
        dkimDomain,
        dkimSelector,
        dkimPrivateKey,
        priority: (priority ?? PRIORITY.CAMPAIGN) as typeof PRIORITY.CAMPAIGN,
        stream: 'broadcast',
      } satisfies BatchSenderJobData,
    }));

    await batchSenderQueue.addBulk(jobs);
    totalDispatched += page.contactIds.length;
    batchIndex += chunks.length;
    cursor = page.nextCursor ?? undefined;

    job.log(`[ab-winner] Dispatched ${totalDispatched} so far (cursor: ${cursor ?? 'done'})`);
  } while (cursor);

  // 3. Mark dispatched
  await internalPost(`/api/v1/internal/campaigns/${campaignId}/ab-winner-dispatched`, {});

  job.log(`[ab-winner] Done — dispatched ${totalDispatched} contacts to winner variant`);
  return { dispatched: totalDispatched };
}

export function startAbWinnerWorker() {
  const worker = new Worker<AbWinnerJobData>(QUEUE_NAMES.AB_WINNER, processAbWinner, {
    connection,
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    console.log(`[ab-winner] Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ab-winner] Job ${job?.id} failed:`, err.message);
    captureJobException(err, {
      queue: 'ab-winner',
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      orgId: (job?.data as { orgId?: string } | undefined)?.orgId,
      campaignId: (job?.data as { campaignId?: string } | undefined)?.campaignId,
    });
  });

  return worker;
}
