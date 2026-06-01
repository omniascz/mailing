/**
 * @forgemsg/workers — BullMQ job processors for the email sending pipeline.
 *
 * Queue architecture:
 *   campaign-splitter           → batch-sender (broadcast)
 *                               → batch-sender-transactional
 *                               → batch-sender-triggered
 *                               → mta-{isp} queues → MTA engine (Go gRPC)
 *
 * Priority levels:
 *   1 = transactional (highest)
 *   2 = triggered (workflow / automation)
 *   3 = campaign (bulk)
 *
 * Message streams determine which batch-sender queue is used and which
 * suppression/frequency-cap rules apply.
 */

import { startCampaignSplitterWorker } from './jobs/campaign-splitter.js';
import { startBatchSenderWorker } from './jobs/batch-sender.js';
import { startMtaSenderWorkers } from './jobs/mta-sender.js';
import { startArchiveWorker } from './jobs/archive-email-events.js';
import { startSeoRankPollWorker, scheduleRankPoll } from './jobs/seo-rank-poll.js';
import { startSocialSchedulerWorker, scheduleSocialJobs } from './jobs/social-scheduler.js';
import { startInvoiceReminderWorker, scheduleCommerceJobs } from './jobs/invoice-reminder.js';
import { startVideoTranscodeWorker, scheduleVideoTranscode } from './jobs/video-transcode.js';
import {
  startSubscriptionBillingWorker,
  scheduleSubscriptionBillingJob,
} from './jobs/subscription-billing.js';
import {
  startAnomalyDetectorWorker,
  scheduleAnomalyDetector,
} from './jobs/anomaly-detector.js';
import { QUEUE_NAMES } from './queues/index.js';
import { initTelemetry, flushTelemetry } from './lib/telemetry.js';

initTelemetry();
console.log('ForgeMsg Workers starting...');

const campaignSplitter = startCampaignSplitterWorker();
const batchSenderBroadcast = startBatchSenderWorker(QUEUE_NAMES.BATCH_SENDER);
const batchSenderTransactional = startBatchSenderWorker(QUEUE_NAMES.BATCH_SENDER_TRANSACTIONAL);
const batchSenderTriggered = startBatchSenderWorker(QUEUE_NAMES.BATCH_SENDER_TRIGGERED);
const mtaSenders = startMtaSenderWorkers();
const archiveWorker = startArchiveWorker();
const seoRankPollWorker = startSeoRankPollWorker();
scheduleRankPoll().catch(console.error);
const { publishWorker: socialPublishWorker, monitorWorker: socialMonitorWorker } =
  startSocialSchedulerWorker();
scheduleSocialJobs().catch(console.error);
const { worker: invoiceReminderWorker, adPerfWorker } = startInvoiceReminderWorker();
scheduleCommerceJobs().catch(console.error);
const videoTranscodeWorker = startVideoTranscodeWorker();
scheduleVideoTranscode().catch(console.error);
const subscriptionBillingWorker = startSubscriptionBillingWorker();
scheduleSubscriptionBillingJob().catch(console.error);
const anomalyDetectorWorker = startAnomalyDetectorWorker();
scheduleAnomalyDetector().catch(console.error);

console.log('All workers started. Waiting for jobs...');

async function shutdown() {
  console.log('Shutting down workers...');
  await Promise.all([
    campaignSplitter.close(),
    batchSenderBroadcast.close(),
    batchSenderTransactional.close(),
    batchSenderTriggered.close(),
    ...mtaSenders.map((w) => w.close()),
    archiveWorker.close(),
    seoRankPollWorker.close(),
    socialPublishWorker.close(),
    socialMonitorWorker.close(),
    invoiceReminderWorker.close(),
    adPerfWorker.close(),
    videoTranscodeWorker.close(),
    subscriptionBillingWorker.close(),
    anomalyDetectorWorker.close(),
  ]);
  await flushTelemetry();
  console.log('All workers stopped.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
