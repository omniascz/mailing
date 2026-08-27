/**
 * CampaignSplitter job — splits a campaign's audience into batches.
 *
 * Flow:
 *   1. Load the audience (list + optional segment filter - exclude segment)
 *   2. Split contact IDs into batches of BATCH_SIZE
 *   3. Enqueue a BatchSender job for each batch
 *   4. Update campaign status to SENDING
 *
 * Receives: CampaignSplitterJobData
 * Produces: N × BatchSenderJobData into batch-sender queue
 */

import { Worker, type Job } from 'bullmq';
import { captureJobException } from '../lib/telemetry.js';
import {
  connection,
  QUEUE_NAMES,
  batchSenderQueue,
  abWinnerQueue,
  type CampaignSplitterJobData,
  type BatchSenderJobData,
  type AbWinnerJobData,
} from '../queues/index.js';
import { INTERNAL_SECRET, internalGetHeaders } from '../lib/internal-api.js';
import {
  claimDispatchBatches,
  confirmDispatchBatches,
  dispatchIdOf,
} from '../lib/dispatch-ledger.js';

const BATCH_SIZE = 1000;

// ─── A/B variant types ────────────────────────────────────────────────────────

interface AbVariant {
  id: string;
  subject: string;
  content: Record<string, unknown>;
  preheader?: string;
  /** Percentage of audience (0-100). Variants must sum to ≤ 100. */
  percentage: number;
}

interface AbConfig {
  variants: AbVariant[];
  /**
   * Carried through to the API, never interpreted here. The default when this
   * is unset lives in DEFAULT_WINNER_CRITERIA (apps/api ab-winner.ts) and must
   * stay in that one place — do not add a fallback on this line.
   */
  winnerCriteria?: 'open_rate' | 'click_rate';
  testDurationHours?: number;
  autoSendWinner?: boolean;
  confidenceThreshold?: number;
}

function parseAbConfig(raw: Record<string, unknown> | undefined): AbConfig | null {
  if (!raw) return null;
  const variants = raw.variants;
  if (!Array.isArray(variants) || variants.length < 2) return null;
  return raw as unknown as AbConfig;
}

// ─── Core splitter ────────────────────────────────────────────────────────────

export async function processCampaignSplitter(job: Job<CampaignSplitterJobData>) {
  const data = job.data;

  // Identity of this send attempt. Stable across BullMQ retries of this job,
  // different for every fresh enqueue — so a retry recognises the batches it
  // already produced, and a legitimate resend starts from a clean ledger.
  const dispatchId = dispatchIdOf(job);

  job.log(`Splitting campaign ${data.campaignId} for org ${data.orgId} (dispatch ${dispatchId})`);

  // Throws on API error — lets BullMQ retry rather than silently sending to 0 contacts.
  const rawIds = await fetchAudienceContactIds(data.orgId, data.campaignId);

  // Deduplicate (defensive against segment returning the same contact twice)
  const contactIds = [...new Set(rawIds)];

  job.log(
    `Total contacts: ${contactIds.length} (${rawIds.length - contactIds.length} dupes removed)`,
  );

  if (contactIds.length === 0) {
    job.log('No contacts in audience — skipping');
    return { batches: 0, totalContacts: 0 };
  }

  const stream = data.stream ?? 'broadcast';
  const abConfig = parseAbConfig(data.abConfig);

  let totalBatches = 0;
  // A/B tests with a holdback keep the campaign in `sending` until the winner
  // job dispatches; everything else is marked `sent` once batches are enqueued.
  let winnerScheduled = false;

  if (abConfig && abConfig.variants.length >= 2) {
    // ── A/B split: distribute contacts across variants by percentage ───────
    // Variants may sum to < 100%, e.g. 40% A + 40% B = 80%.
    // The remaining 20% (holdback) is dispatched to the winner after the test window.
    job.log(`A/B test: ${abConfig.variants.length} variants`);

    const totalVariantPct = abConfig.variants.reduce((s, v) => s + v.percentage, 0);
    const holdbackPct = Math.max(0, 100 - totalVariantPct);

    // Slice every variant up front so the number the counter is armed with and
    // the batches actually enqueued come from one array. Computing that total
    // twice would eventually let the two disagree, and a counter that is one
    // out never reaches zero — the campaign would never close.
    let cursor = 0;
    const variantPlan = abConfig.variants.map((variant) => {
      const variantSize = Math.floor((variant.percentage / 100) * contactIds.length);
      const variantIds = contactIds.slice(cursor, cursor + variantSize);
      cursor += variantSize;

      const variantBatches: string[][] = [];
      for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
        variantBatches.push(variantIds.slice(i, i + BATCH_SIZE));
      }
      return { variant, variantIds, variantBatches };
    });
    const variantBatchTotal = variantPlan.reduce((n, p) => n + p.variantBatches.length, 0);

    // Only a test that holds contacts back AND says how long to wait produces a
    // winner job. Anything else is a single-phase send wearing an ab_config.
    const testDurationHours = abConfig.testDurationHours ?? 0;
    const willScheduleWinner = holdbackPct > 0 && testDurationHours > 0;

    // The invariant this whole branch turns on: **either the winner job closes
    // this campaign, or the counter does.** Never neither.
    //
    // Every A/B campaign used to arm no counter at all, on the reasoning that
    // its variant batches are only the first phase — true when a winner job is
    // coming, and the reason for the null below. But the splitter schedules
    // that job only under the condition above, and when it does not, nothing
    // was left that could ever close the campaign: no counter to reach zero, no
    // winner job, and a reaper that skips campaigns without a counter. Measured
    // on a live database: `sending`, pending_batches NULL, zero winner jobs,
    // still `sending` after the reaper ran against a row aged 48 hours.
    //
    // Variants summing to 100 are the ordinary case of that — a legitimate
    // single-phase test with no holdback — and they now close the way every
    // other single-phase send does, on their last batch.
    await startDispatch(
      data.campaignId,
      data.orgId,
      contactIds.length,
      willScheduleWinner ? null : variantBatchTotal,
    );

    if (holdbackPct > 0 && !willScheduleWinner) {
      // validateCampaignReadiness refuses this config at the click on Send, so
      // arriving here means something reached the splitter without passing that
      // gate. The campaign will still close — the counter above is armed — but
      // the held-back contacts are getting nothing, and that must not be quiet.
      console.error(
        `[campaign-splitter] campaign ${data.campaignId} holds back ${holdbackPct.toFixed(1)}% ` +
          `of its audience but names no testDurationHours, so no winner job can be scheduled ` +
          `and those contacts will not be sent anything. Closing on the variant batches instead.`,
      );
    }

    for (const { variant, variantIds, variantBatches } of variantPlan) {
      if (variantIds.length === 0) continue;

      const variantKeys = variantBatches.map((_, index) => `v${variant.id}-${index}`);
      const claim = await claimDispatchBatches(
        data.campaignId,
        data.orgId,
        dispatchId,
        variantKeys,
      );
      const wanted = new Set(claim.toEnqueue);
      if (claim.alreadyEnqueued.length > 0) {
        job.log(
          `Variant ${variant.id}: ${claim.alreadyEnqueued.length} of ${variantKeys.length} ` +
            `batches were already enqueued by an earlier run — skipping those`,
        );
      }

      const batchJobs = variantBatches
        .map((batch, index) => ({ batch, index, key: `v${variant.id}-${index}` }))
        .filter(({ key }) => wanted.has(key))
        .map(({ batch, index, key }) => ({
          name: `batch-${data.campaignId}-v${variant.id}-${index}`,
          data: {
            campaignId: data.campaignId,
            orgId: data.orgId,
            batchIndex: totalBatches + index,
            dispatchId,
            batchKey: key,
            contactIds: batch,
            content: variant.content,
            subject: variant.subject,
            preheader: variant.preheader ?? data.preheader,
            fromName: data.fromName,
            fromEmail: data.fromEmail,
            replyTo: data.replyTo,
            dkimDomain: data.dkimDomain,
            dkimSelector: data.dkimSelector,
            dkimPrivateKey: data.dkimPrivateKey,
            priority: data.priority,
            stream,
            timewarp: data.timewarp,
            abVariantId: variant.id,
            utmTracking: data.utmTracking,
            companyName: data.companyName,
            locale: data.locale,
            companyAddress: data.companyAddress,
            footerHtml: data.footerHtml,
            footerText: data.footerText,
            openTracking: data.openTracking,
            clickTracking: data.clickTracking,
            ipPoolId: data.ipPoolId,
            tlsPolicy: data.tlsPolicy,
            processingPurposeId: data.processingPurposeId,
          } satisfies BatchSenderJobData,
          opts: { priority: data.priority, jobId: `${dispatchId}:${key}` },
        }));

      if (batchJobs.length > 0) {
        await batchSenderQueue.addBulk(batchJobs);
        await confirmDispatchBatches(data.campaignId, dispatchId, claim.toEnqueue);
      }
      totalBatches += variantBatches.length;
      job.log(
        `Variant ${variant.id}: ${variantIds.length} contacts, ${variantBatches.length} batches`,
      );
    }

    // ── Holdback: store remaining contacts + schedule winner dispatch ──────
    //
    // `autoSendWinner !== false` used to be part of this condition, which meant
    // a test with auto-send switched off got no winner job, no stored holdback
    // and no way to finish: the held-back contacts were silently dropped and
    // the campaign sat in `sending` for good. Auto-send off does not mean "do
    // not run the test", it means "do not dispatch the winner without asking" —
    // so the job is scheduled either way and computeAbWinner's own
    // `autoSendConfigured` check parks the campaign for a human. That branch
    // existed in decideDispatch and was unreachable from here.
    if (willScheduleWinner) {
      const holdbackIds = contactIds.slice(cursor);
      job.log(
        `Holdback: ${holdbackIds.length} contacts (${holdbackPct.toFixed(1)}%) for winner dispatch`,
      );

      if (holdbackIds.length > 0) {
        await storeHoldback(data.orgId, data.campaignId, holdbackIds);
      }

      // Schedule delayed winner job — fires after test window elapses
      const delayMs = testDurationHours * 3600_000;
      const winnerJobData: AbWinnerJobData = {
        campaignId: data.campaignId,
        orgId: data.orgId,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
        replyTo: data.replyTo,
        dkimDomain: data.dkimDomain,
        dkimSelector: data.dkimSelector,
        dkimPrivateKey: data.dkimPrivateKey,
        priority: data.priority,
      };
      await abWinnerQueue.add(`winner-${data.campaignId}`, winnerJobData, {
        delay: delayMs,
        jobId: `ab-winner-${data.campaignId}`,
        removeOnComplete: true,
      });
      winnerScheduled = true;
      job.log(`Scheduled winner dispatch in ${abConfig.testDurationHours}h`);
    }
  } else {
    // ── Standard split ─────────────────────────────────────────────────────
    const batches: string[][] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      batches.push(contactIds.slice(i, i + BATCH_SIZE));
    }

    const keys = batches.map((_, index) => String(index));

    // Arm the counter BEFORE anything is enqueued. A batch can finish while the
    // splitter is still working, and a completion that arrives before the
    // counter exists has nothing to decrement and is lost — which would leave
    // the campaign one short of closing, for good.
    await startDispatch(data.campaignId, data.orgId, contactIds.length, batches.length);

    const claim = await claimDispatchBatches(data.campaignId, data.orgId, dispatchId, keys);
    const wanted = new Set(claim.toEnqueue);
    if (claim.alreadyEnqueued.length > 0) {
      job.log(
        `${claim.alreadyEnqueued.length} of ${keys.length} batches were already enqueued by ` +
          `an earlier run of this dispatch — skipping those`,
      );
    }

    const batchJobs = batches
      .map((batch, index) => ({ batch, index, key: String(index) }))
      .filter(({ key }) => wanted.has(key))
      .map(({ batch, index, key }) => ({
        name: `batch-${data.campaignId}-${index}`,
        data: {
          campaignId: data.campaignId,
          orgId: data.orgId,
          batchIndex: index,
          dispatchId,
          batchKey: key,
          contactIds: batch,
          content: data.content,
          subject: data.subject,
          preheader: data.preheader,
          fromName: data.fromName,
          fromEmail: data.fromEmail,
          replyTo: data.replyTo,
          dkimDomain: data.dkimDomain,
          dkimSelector: data.dkimSelector,
          dkimPrivateKey: data.dkimPrivateKey,
          priority: data.priority,
          stream,
          timewarp: data.timewarp,
          utmTracking: data.utmTracking,
          companyName: data.companyName,
          locale: data.locale,
          companyAddress: data.companyAddress,
          footerHtml: data.footerHtml,
          footerText: data.footerText,
          openTracking: data.openTracking,
          clickTracking: data.clickTracking,
          ipPoolId: data.ipPoolId,
          tlsPolicy: data.tlsPolicy,
          processingPurposeId: data.processingPurposeId,
        } satisfies BatchSenderJobData,
        opts: { priority: data.priority, jobId: `${dispatchId}:${key}` },
      }));

    if (batchJobs.length > 0) {
      await batchSenderQueue.addBulk(batchJobs);
      await confirmDispatchBatches(data.campaignId, dispatchId, claim.toEnqueue);
    }
    totalBatches = batches.length;
  }

  job.log(`Enqueued ${totalBatches} batch jobs`);

  // An audience that resolved to nobody. No batch exists, so nothing will ever
  // report in and nothing can close the campaign out — leaving it in `sending`
  // would be the stuck state under a new name. Closed here, loudly, as the one
  // case the counter cannot handle.
  if (totalBatches === 0) {
    job.log('No batches were enqueued — the audience resolved to nobody. Marking failed.');
    await updateCampaignStatus(data.campaignId, 'failed');
    return { batches: 0, totalContacts: contactIds.length };
  }

  // Every batch is on the queue, so the send has begun — this is `sending`, not
  // `sent`. It used to be `sent` here, which is why a campaign reported itself
  // finished before a single message had been handed to an MX. It is closed out
  // by its last batch reporting in, except when a winner job was scheduled
  // above, which closes it after the test window instead. `winnerScheduled` is
  // exactly the condition under which the counter was left unarmed, so the two
  // branches of the log line below are the two ways a campaign can end — and
  // every campaign reaching this point has one of them.
  await updateCampaignStatus(data.campaignId, 'sending');
  job.log(
    winnerScheduled
      ? 'Campaign is sending — the winner job closes it out after the test window'
      : 'Campaign is sending — the last batch to report in closes it out',
  );

  return { batches: totalBatches, totalContacts: contactIds.length };
}

// ─── DB interaction stubs (injected at runtime via services) ─────────────────

/**
 * Fetch contact IDs for a campaign's audience.
 *
 * Queries: contacts WHERE org_id AND list_id, optionally filtered by segment,
 * minus contacts in excludeSegment, minus suppressed contacts.
 */
async function fetchAudienceContactIds(orgId: string, campaignId: string): Promise<string[]> {
  const url = `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/internal/audience`;
  const params = new URLSearchParams({ orgId, campaignId });

  const res = await fetch(`${url}?${params}`, { headers: internalGetHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`fetchAudienceContactIds: API ${res.status} — ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { data: { contactIds: string[] } };
  return body.data.contactIds;
}

async function storeHoldback(
  orgId: string,
  campaignId: string,
  contactIds: string[],
): Promise<void> {
  const url = `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/internal/campaigns/${campaignId}/ab-holdback`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ orgId, contactIds }),
    });
  } catch (err) {
    console.error('storeHoldback failed:', err);
  }
}

/**
 * Tell the API how big this dispatch is, before any of it is enqueued.
 *
 * Not best-effort: if this fails the counter is never armed, every batch's
 * completion report finds nothing to decrement, and the campaign sits in
 * `sending` until the reaper picks it up. Better to fail the splitter job and
 * retry — the ledger makes re-running it safe.
 */
async function startDispatch(
  campaignId: string,
  orgId: string,
  plannedRecipients: number,
  batchCount: number | null,
): Promise<void> {
  const url = `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/internal/campaigns/${campaignId}/dispatch-start`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({ orgId, plannedRecipients, batchCount }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`dispatch-start for ${campaignId} → ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Drive the campaign's status from the splitter.
 *
 * `res.ok` is checked, which it was not: the route validated the status against
 * an enum that did not contain 'failed', so the empty-audience branch above got
 * a 400 on every call and this function threw it away. The campaign it was
 * meant to close stayed in `queueing` for good — measured against a live API.
 * The enum has been corrected, and a refusal is now at least visible if it ever
 * happens again.
 *
 * Still best-effort rather than throwing: by the time this runs the batches are
 * on the queue, and failing the splitter job would re-run a dispatch that
 * succeeded. A status that does not stick is recoverable by the reaper; a
 * duplicate send is not.
 */
async function updateCampaignStatus(campaignId: string, status: string): Promise<void> {
  const url = `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/internal/campaigns/${campaignId}/status`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[campaign-splitter] status '${status}' for ${campaignId} was REFUSED: ` +
          `HTTP ${res.status} ${text.slice(0, 300)}`,
      );
    }
  } catch (err) {
    console.error('updateCampaignStatus failed:', err);
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export function startCampaignSplitterWorker() {
  const worker = new Worker<CampaignSplitterJobData>(
    QUEUE_NAMES.CAMPAIGN_SPLITTER,
    processCampaignSplitter,
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[campaign-splitter] Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[campaign-splitter] Job ${job?.id} failed:`, err.message);
    captureJobException(err, {
      queue: 'campaign-splitter',
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      orgId: (job?.data as { orgId?: string } | undefined)?.orgId,
      campaignId: (job?.data as { campaignId?: string } | undefined)?.campaignId,
    });
  });

  return worker;
}
