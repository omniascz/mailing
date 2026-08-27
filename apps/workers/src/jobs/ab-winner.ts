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
import {
  claimDispatchBatches,
  confirmDispatchBatches,
  dispatchIdOf,
} from '../lib/dispatch-ledger.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';
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
  decision: 'auto_send' | 'needs_review';
  decisionReason: string | null;
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

export async function processAbWinner(job: Job<AbWinnerJobData>) {
  const { campaignId, orgId } = job.data;
  // See dispatchIdOf — the winner job's BullMQ id is fixed per campaign, so the
  // timestamp is what separates a retry from a genuinely new dispatch.
  const dispatchId = dispatchIdOf(job);
  job.log(`[ab-winner] Campaign ${campaignId} — computing winner (dispatch ${dispatchId})`);

  // 1. Compute winner
  const result = await internalPost<WinnerComputeResult>(
    `/api/v1/internal/campaigns/${campaignId}/ab-winner-compute`,
    { orgId },
  );

  job.log(
    `[ab-winner] Winner: ${result.winnerVariantId} ` +
      `(${result.metric}, confidence ${result.confidencePct.toFixed(1)}%)`,
  );

  // Nothing below may return leaving the campaign with no way to end.
  //
  // Either this job dispatches the holdback — and then the last of those
  // batches closes the campaign through the counter — or it names an outcome
  // itself. Every early exit used to do neither, leaving the campaign in
  // `sending` with nothing that could ever move it.
  if (!result.autoSendWinner) {
    job.log(`[ab-winner] ${result.decision} — ${result.decisionReason ?? 'no reason recorded'}`);

    if (result.decision === 'needs_review') {
      // Below the confidence threshold, or auto-send is off, or there is only
      // one arm to judge. The holdback stays unsent and the campaign is parked
      // for a human — dispatching a winner the test could not establish is
      // worse than waiting, because it looks like a decision.
      //
      // The reason is recorded now. Parking used to write a bare 'paused',
      // indistinguishable from an operator's pause, and Resume answered that by
      // flipping the campaign to `sending` with nothing on the queue.
      await updateCampaignStatus(campaignId, 'paused', 'ab_needs_review');
      return { dispatched: 0, decision: result.decision };
    }

    // decision is 'auto_send' but the holdback is not on offer: computeAbWinner
    // returns autoSendWinner=false for an already-dispatched result. So a
    // previous run of this job enqueued the whole holdback and marked it
    // dispatched — this is the replay.
    //
    // It writes no status, and that is the change the two-phase counter makes
    // here. The earlier run raised the counter by the holdback's batches before
    // enqueueing them, so those batches are outstanding and the last one to
    // report closes the campaign on its own. Writing `sent` here would be the
    // old defect in a new place: the campaign marked finished while its final
    // batches are still on the queue.
    job.log(
      '[ab-winner] The holdback was already dispatched by an earlier run of this job. Its ' +
        'batches are counted and will close the campaign when the last of them reports in.',
    );
    return { dispatched: 0, decision: result.decision, replayed: true };
  }

  // Resolve winning variant details from rankings
  const winner = result.rankings.find((r) => r.variantId === result.winnerVariantId);
  if (!winner) {
    // The stored result names a variant that ab_config no longer holds — it was
    // edited after the test started. There is no content to dispatch and no way
    // for this job to guess one, so the holdback cannot go out automatically.
    // That is the same situation as a result too close to call: a decision only
    // a human can make, and the campaign is parked for one rather than left
    // running with nothing behind it.
    job.log(
      `[ab-winner] Winner variant ${result.winnerVariantId} is not in the campaign's current ` +
        `ab_config — it was changed after the test started. Parking for review.`,
    );
    await updateCampaignStatus(campaignId, 'paused', 'ab_needs_review');
    return { dispatched: 0, decision: result.decision };
  }

  const { fromName, fromEmail, replyTo, dkimDomain, dkimSelector, dkimPrivateKey, priority } =
    job.data;

  // 2. Arm the counter for this phase BEFORE a single batch is enqueued.
  //
  // Same rule as the splitter's: a batch can finish while this job is still
  // paginating, and a completion that arrives before the counter has been
  // raised decrements a number that does not yet include it — leaving the
  // campaign one short of closing, permanently.
  //
  // The count comes from the holdback table rather than from the pagination
  // that follows, because it has to be known first. Nothing writes holdback
  // rows after the splitter, so the two agree; the loop below checks that they
  // did, and fails loudly if they ever do not.
  const phase = await internalPost<{
    armed: boolean;
    reason?: string;
    expectedBatches: number;
    holdbackCount: number;
  }>(`/api/v1/internal/campaigns/${campaignId}/ab-winner-phase-start`, { orgId, batchSize: BATCH_SIZE });

  if (!phase.armed) {
    // The campaign was not waiting for a winner dispatch. Either an earlier run
    // of this job already added these batches — in which case they are on the
    // queue and will close the campaign themselves — or this campaign never had
    // a holdback to dispatch. Adding them a second time would leave a counter
    // that can never reach zero.
    job.log(
      `[ab-winner] The counter was not expecting a winner dispatch (${phase.reason ?? 'unknown'}); ` +
        `an earlier run of this job already added these batches. Leaving them to close the campaign.`,
    );
  }

  job.log(
    `[ab-winner] Holdback: ${phase.holdbackCount} contacts in ${phase.expectedBatches} batch(es)`,
  );

  // 3. Paginate holdback contacts and enqueue batch-sender jobs
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

    const keys = chunks.map((_, idx) => `w${batchIndex + idx}`);
    const claim = await claimDispatchBatches(campaignId, orgId, dispatchId, keys);
    const wanted = new Set(claim.toEnqueue);
    if (claim.alreadyEnqueued.length > 0) {
      job.log(
        `[ab-winner] ${claim.alreadyEnqueued.length} of ${keys.length} batches were already ` +
          `enqueued by an earlier run of this dispatch — skipping those`,
      );
    }

    const jobs = chunks
      .map((batch, idx) => ({ batch, idx, key: `w${batchIndex + idx}` }))
      .filter(({ key }) => wanted.has(key))
      .map(({ batch, idx, key }) => ({
        name: `ab-winner-${campaignId}-${batchIndex + idx}`,
        data: {
          campaignId,
          orgId,
          batchIndex: batchIndex + idx,
          dispatchId,
          batchKey: key,
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
        opts: { jobId: `${dispatchId}:${key}` },
      }));

    if (jobs.length > 0) {
      await batchSenderQueue.addBulk(jobs);
      await confirmDispatchBatches(campaignId, dispatchId, claim.toEnqueue);
    }
    totalDispatched += page.contactIds.length;
    batchIndex += chunks.length;
    cursor = page.nextCursor ?? undefined;

    job.log(`[ab-winner] Dispatched ${totalDispatched} so far (cursor: ${cursor ?? 'done'})`);
  } while (cursor);

  // The counter was raised by exactly `expectedBatches`, so exactly that many
  // batches must have been produced. If they disagree the counter can never
  // reach zero and the campaign would sit in `sending` for good — better to
  // fail the job, which retries and then closes the campaign through the
  // terminal handler, than to leave it silently unclosable.
  if (phase.armed && batchIndex !== phase.expectedBatches) {
    throw new Error(
      `[ab-winner] campaign ${campaignId}: the counter was raised for ${phase.expectedBatches} ` +
        `holdback batch(es) but ${batchIndex} were produced. Refusing to leave the campaign with ` +
        `a counter that cannot reach zero.`,
    );
  }

  // 4. Mark dispatched
  await internalPost(`/api/v1/internal/campaigns/${campaignId}/ab-winner-dispatched`, {});

  // Deliberately NO status write here.
  //
  // This used to mark the campaign `sent` the moment `addBulk` returned — the
  // exact defect the state model removed from the ordinary send path, where
  // `sent` used to mean "queued". The holdback has been handed to the queue and
  // not one of its messages has reached an MX yet. The campaign is closed by
  // the last of these batches reporting in, like every other send.
  job.log(
    `[ab-winner] Done — ${totalDispatched} contacts queued to the winning variant. The last ` +
      `of those batches to report in closes the campaign.`,
  );
  return { dispatched: totalDispatched, decision: result.decision };
}

/**
 * Drive the campaign lifecycle from the winner job.
 *
 * This THROWS on failure, where it used to swallow everything and log. The old
 * comment argued that failing the job over a status write would re-run a
 * dispatch that succeeded — but a swallowed failure leaves the campaign in
 * `sending` with no counter, no winner job and a reaper that skips it, which is
 * permanent. Re-running is not: the dispatch ledger refuses batch keys it has
 * already enqueued, and a replay whose holdback went out lands in the
 * already-dispatched branch above and writes `sent`. So the retry is safe and
 * the silence was not.
 *
 * If every attempt fails, the job's terminal handler closes the campaign from
 * the API side rather than leaving it open.
 */
async function updateCampaignStatus(
  campaignId: string,
  status: 'sent' | 'paused',
  pausedReason?: 'ab_needs_review',
): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/internal/campaigns/${campaignId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify(pausedReason ? { status, pausedReason } : { status }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[ab-winner] status '${status}' for ${campaignId} → HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Last exit: the winner job has failed on every attempt.
 *
 * The errors that get here are the ones retrying cannot help with — no variant
 * has any recorded sends to compare, or ab_config no longer holds the variants
 * the stored result names. Three attempts on a 5 s exponential backoff burn
 * through that in about fifteen seconds and then the job is gone, and with it
 * the only thing that could ever close this campaign.
 *
 * The sent-or-failed verdict is taken on the API side, where the dispatch
 * ledger is: a campaign whose variants reached real people is not a failure
 * merely because its holdback never followed.
 */
export async function closeAfterTerminalFailure(
  campaignId: string,
  orgId: string,
  reason: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/campaigns/${campaignId}/ab-winner-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ orgId, reason: reason.slice(0, 500) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[ab-winner] campaign ${campaignId} could not be closed after terminal failure: ` +
          `HTTP ${res.status} ${text.slice(0, 200)}. It is left in 'sending' and needs a human.`,
      );
      return;
    }
    const body = (await res.json()) as { data: { outcome: string; totalSent: number } };
    console.error(
      `[ab-winner] campaign ${campaignId} closed as '${body.data.outcome}' after its winner job ` +
        `failed terminally (${reason}); ${body.data.totalSent} message(s) had gone out.`,
    );
  } catch (err) {
    console.error(
      `[ab-winner] campaign ${campaignId} could not be closed after terminal failure:`,
      err,
    );
  }
}

/** Whether BullMQ has just spent this job's last attempt. */
export function isFinalAttempt(attemptsMade: number | undefined, attempts: number | undefined) {
  return (attemptsMade ?? 0) >= (attempts ?? 1);
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

    // The last attempt is the last chance. After this the job is gone, and an
    // A/B campaign with no winner job has nothing left that can close it.
    const campaignId = (job?.data as { campaignId?: string } | undefined)?.campaignId;
    const orgId = (job?.data as { orgId?: string } | undefined)?.orgId;
    if (campaignId && orgId && isFinalAttempt(job?.attemptsMade, job?.opts?.attempts)) {
      void closeAfterTerminalFailure(campaignId, orgId, err.message);
    }
  });

  return worker;
}
