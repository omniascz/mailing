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
import {
  connection,
  QUEUE_NAMES,
  batchSenderQueue,
  type CampaignSplitterJobData,
  type BatchSenderJobData,
} from '../queues/index.js';

const BATCH_SIZE = 1000;

async function processCampaignSplitter(job: Job<CampaignSplitterJobData>) {
  const data = job.data;

  job.log(`Splitting campaign ${data.campaignId} for org ${data.orgId}`);

  // Fetch contact IDs matching the audience criteria.
  // In production this queries the DB; here we define the interface.
  const contactIds = await fetchAudienceContactIds(
    data.orgId,
    data.listId,
    data.segmentId,
    data.excludeSegmentId,
  );

  job.log(`Total contacts: ${contactIds.length}`);

  if (contactIds.length === 0) {
    job.log('No contacts in audience — skipping');
    return { batches: 0, totalContacts: 0 };
  }

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    batches.push(contactIds.slice(i, i + BATCH_SIZE));
  }

  // Enqueue batch jobs
  const batchJobs = batches.map((batch, index): {
    name: string;
    data: BatchSenderJobData;
    opts: { priority: number };
  } => ({
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
      stream: data.stream ?? 'broadcast',
    },
    opts: { priority: data.priority },
  }));

  await batchSenderQueue.addBulk(batchJobs);

  job.log(`Enqueued ${batches.length} batch jobs`);

  // Update campaign status to 'sending'
  await updateCampaignStatus(data.campaignId, 'sending');

  return {
    batches: batches.length,
    totalContacts: contactIds.length,
  };
}

// ─── DB interaction stubs (injected at runtime via services) ─────────────────

/**
 * Fetch contact IDs for a campaign's audience.
 *
 * Queries: contacts WHERE org_id AND list_id, optionally filtered by segment,
 * minus contacts in excludeSegment, minus suppressed contacts.
 */
async function fetchAudienceContactIds(
  orgId: string,
  listId: string,
  segmentId?: string,
  excludeSegmentId?: string,
): Promise<string[]> {
  // This will be replaced with actual DB queries importing from the API package.
  // For now, the worker is structured to receive contact IDs from the splitter
  // or fetch them via an internal API call.

  const url = `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/internal/audience`;
  const params = new URLSearchParams({ orgId, listId });
  if (segmentId) params.set('segmentId', segmentId);
  if (excludeSegmentId) params.set('excludeSegmentId', excludeSegmentId);

  try {
    const res = await fetch(`${url}?${params}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body = (await res.json()) as { data: { contactIds: string[] } };
    return body.data.contactIds;
  } catch (err) {
    console.error('fetchAudienceContactIds failed:', err);
    return [];
  }
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
  });

  return worker;
}
