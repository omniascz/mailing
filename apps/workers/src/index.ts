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
import { startViberSenderWorker } from './jobs/viber-sender.js';
import { startExternalFeedPollWorker, scheduleExternalFeedPoll } from './jobs/external-feed-poll.js';
import { startWarmupAdvanceWorker, scheduleWarmupAdvance } from './jobs/warmup-advance.js';
import { startDmarcImapPollWorker, scheduleDmarcImapPoll } from './jobs/dmarc-imap-poll.js';
import { startAbWinnerWorker } from './jobs/ab-winner.js';
import { startBlacklistMonitorWorker, scheduleBlacklistMonitor } from './jobs/blacklist-monitor.js';
import { startRcsSenderWorker } from './jobs/rcs-sender.js';
import { startWorkflowEmailWorker } from './jobs/workflow-email-sender.js';
import { startWorkflowSmsWorker } from './jobs/workflow-sms-sender.js';
import { startWorkflowSchedulerWorkers, scheduleWorkflowJobs } from './jobs/workflow-scheduler.js';
import { QUEUE_NAMES } from './queues/index.js';
import { initTelemetry, flushTelemetry } from './lib/telemetry.js';
import { registerCzSkMergeFilters } from './lib/merge-filters-cz-sk.js';

initTelemetry();
// Register CZ/SK declension pipe-filters before any batch-sender starts (#606–#608)
registerCzSkMergeFilters();
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
const viberSenderWorker = startViberSenderWorker();
const externalFeedPollWorker = startExternalFeedPollWorker();
scheduleExternalFeedPoll().catch(console.error);
const warmupAdvanceWorker = startWarmupAdvanceWorker();
scheduleWarmupAdvance().catch(console.error);
const dmarcImapPollWorker = startDmarcImapPollWorker();
scheduleDmarcImapPoll().catch(console.error);
const abWinnerWorker = startAbWinnerWorker();
const blacklistMonitorWorker = startBlacklistMonitorWorker();
scheduleBlacklistMonitor().catch(console.error);

// Engine bus — consumers for the workflow-triggered 'email'/'sms' queues + the
// repeatable run-resumer and daily-trigger cron. Without these, automation
// (multi-step workflows, RFM/predictions, date/holiday triggers) does not run.
const rcsSenderWorker = startRcsSenderWorker();
const workflowEmailWorker = startWorkflowEmailWorker();
const workflowSmsWorker = startWorkflowSmsWorker();
const {
  resumeWorker: workflowResumeWorker,
  dailyWorker: dailyTriggersWorker,
  warehouseWorker: warehouseSyncWorker,
} = startWorkflowSchedulerWorkers();
scheduleWorkflowJobs().catch(console.error);

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
    viberSenderWorker.close(),
    externalFeedPollWorker.close(),
    warmupAdvanceWorker.close(),
    dmarcImapPollWorker.close(),
    abWinnerWorker.close(),
    blacklistMonitorWorker.close(),
    rcsSenderWorker.close(),
    workflowEmailWorker.close(),
    workflowSmsWorker.close(),
    workflowResumeWorker.close(),
    dailyTriggersWorker.close(),
    warehouseSyncWorker.close(),
  ]);
  await flushTelemetry();
  console.log('All workers stopped.');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
