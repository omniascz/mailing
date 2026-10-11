/**
 * Run a queued MTA job through the real processor at its organisation's send
 * rate (Z134).
 *
 * Since Z134 a message of the shared transactional path carries its org's
 * per-second rate (orgSendRate) and the processor paces it by deferring the
 * job to its slot — which only an active job, locked by a worker, can do. A
 * test that calls processMtaSend directly on a waiting job, one right after
 * another, delivers faster than the rate and lands on that deferral. Waiting
 * one slot interval first is what a worker's pacing would have done, so the
 * processor finds the organisation's timeline free and sends at once.
 */
import type { Job } from 'bullmq';
import { processMtaSend } from '../../jobs/mta-sender.js';
import type { MtaSendJobData } from '../../queues/index.js';

export async function processAtOrgRate(job: Job<MtaSendJobData>): Promise<unknown> {
  const rate = job.data?.orgSendRate;
  if (rate && rate > 0) await new Promise((r) => setTimeout(r, Math.ceil(1000 / rate) + 5));
  return processMtaSend(job);
}
