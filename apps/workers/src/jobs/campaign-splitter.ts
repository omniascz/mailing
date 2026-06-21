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
  type CampaignSplitterJobData,
  type BatchSenderJobData,
} from '../queues/index.js';

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
  winnerCriteria?: 'open_rate' | 'click_rate';
  testDurationHours?: number;
}

function parseAbConfig(raw: Record<string, unknown> | undefined): AbConfig | null {
  if (!raw) return null;
  const variants = raw.variants;
  if (!Array.isArray(variants) || variants.length < 2) return null;
  return raw as unknown as AbConfig;
}

// ─── Core splitter ────────────────────────────────────────────────────────────

async function processCampaignSplitter(job: Job<CampaignSplitterJobData>) {
  const data = job.data;

  job.log(`Splitting campaign ${data.campaignId} for org ${data.orgId}`);

  // Throws on API error — lets BullMQ retry rather than silently sending to 0 contacts.
  const rawIds = await fetchAudienceContactIds(data.orgId, data.campaignId);

  // Deduplicate (defensive against segment returning the same contact twice)
  const contactIds = [...new Set(rawIds)];

  job.log(`Total contacts: ${contactIds.length} (${rawIds.length - contactIds.length} dupes removed)`);

  if (contactIds.length === 0) {
    job.log('No contacts in audience — skipping');
    return { batches: 0, totalContacts: 0 };
  }

  const stream = data.stream ?? 'broadcast';
  const abConfig = parseAbConfig(data.abConfig);

  let totalBatches = 0;

  if (abConfig && abConfig.variants.length >= 2) {
    // ── A/B split: distribute contacts across variants by percentage ───────
    job.log(`A/B test: ${abConfig.variants.length} variants`);

    let cursor = 0;
    for (const variant of abConfig.variants) {
      const variantSize = Math.floor((variant.percentage / 100) * contactIds.length);
      const variantIds = contactIds.slice(cursor, cursor + variantSize);
      cursor += variantSize;

      if (variantIds.length === 0) continue;

      const variantBatches: string[][] = [];
      for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
        variantBatches.push(variantIds.slice(i, i + BATCH_SIZE));
      }

      const batchJobs = variantBatches.map((batch, index) => ({
        name: `batch-${data.campaignId}-v${variant.id}-${index}`,
        data: {
          campaignId: data.campaignId,
          orgId: data.orgId,
          batchIndex: totalBatches + index,
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
        } satisfies BatchSenderJobData,
        opts: { priority: data.priority },
      }));

      await batchSenderQueue.addBulk(batchJobs);
      totalBatches += variantBatches.length;
      job.log(`Variant ${variant.id}: ${variantIds.length} contacts, ${variantBatches.length} batches`);
    }
  } else {
    // ── Standard split ─────────────────────────────────────────────────────
    const batches: string[][] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      batches.push(contactIds.slice(i, i + BATCH_SIZE));
    }

    const batchJobs = batches.map((batch, index) => ({
      name: `batch-${data.campaignId}-${index}`,
      data: {
        campaignId: data.campaignId,
        orgId: data.orgId,
        batchIndex: index,
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
      } satisfies BatchSenderJobData,
      opts: { priority: data.priority },
    }));

    await batchSenderQueue.addBulk(batchJobs);
    totalBatches = batches.length;
  }

  job.log(`Enqueued ${totalBatches} batch jobs`);

  // Mark campaign sending only AFTER successful enqueue
  await updateCampaignStatus(data.campaignId, 'sending');

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

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`fetchAudienceContactIds: API ${res.status} — ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { data: { contactIds: string[] } };
  return body.data.contactIds;
}

async function updateCampaignStatus(campaignId: string, status: string): Promise<void> {
  const url = `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/internal/campaigns/${campaignId}/status`;
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
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
