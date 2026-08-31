/**
 * BullMQ queue definitions for the email sending pipeline.
 *
 * Queue hierarchy:
 *   campaign-splitter         — splits audience into batches of 1000
 *   batch-sender              — broadcast stream (bulk campaigns)
 *   batch-sender-transactional — transactional stream (API-triggered, no freq cap)
 *   batch-sender-triggered    — triggered stream (workflow/automation)
 *   mta-gmail                 — per-ISP throttled queues (consumed by MTASender worker)
 *   mta-microsoft
 *   mta-yahoo
 *   mta-other
 *
 * Priority levels:
 *   1 = transactional (highest)
 *   2 = triggered (workflow / automation)
 *   3 = campaign (bulk)
 *
 * Message streams:
 *   broadcast     — bulk marketing campaigns (suppression + freq cap applied)
 *   transactional — receipts, password resets (suppression skipped, no freq cap)
 *   triggered     — workflow-fired messages (suppression applied, no freq cap)
 */

import { Queue, type QueueOptions } from 'bullmq';

// ─── Shared connection config ────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
  };
}

export const connection = parseRedisUrl(REDIS_URL);

/**
 * Retention. These values MUST stay in lockstep with the API's copy in
 * `apps/api/src/lib/queues.ts` — the two sets are not alternatives, they are two
 * producers writing to the SAME physical Redis queues (`mta-other` and
 * `campaign-splitter` are written from both sides). BullMQ takes job options
 * from whoever added the job, so a job's retention depends on which process
 * enqueued it, not on which queue it landed in.
 *
 * They had already drifted and nobody noticed: the API side carried no `age` at
 * all, so an API-enqueued job sat in the failed set until 500 newer failures
 * pushed it out — unbounded in time — while this side gave a worker-enqueued
 * job on the identical queue 7 days. Change one side, change the other.
 *
 * completed → 1 h: a completed job is a receipt nobody reads. The count cap is
 * what keeps a short debugging window; the age cap is what stops a payload from
 * outliving its usefulness.
 *
 * failed → 24 h, deliberately NOT 1 h: a failed `campaign-splitter` job is the
 * only surviving evidence of a campaign stuck in `sending` (no cron re-picks
 * it). That has to be readable the next working morning, so it must survive a
 * night. 24 h is the shortest window that does. It is a cut from 7 days, which
 * is why it is a cut and not a removal.
 *
 * Note on what `age` does and does not buy: BullMQ trims by age when a job
 * reaches that state, so on a quiet queue an old entry lingers until the next
 * job completes or fails. `age` is a ceiling on an active queue, not a timer.
 */
const defaultOpts: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000, age: 3_600 },
    removeOnFail: { count: 5000, age: 24 * 3_600 },
  },
};

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  CAMPAIGN_SPLITTER: 'campaign-splitter',
  BATCH_SENDER: 'batch-sender',
  BATCH_SENDER_TRANSACTIONAL: 'batch-sender-transactional',
  BATCH_SENDER_TRIGGERED: 'batch-sender-triggered',
  MTA_GMAIL: 'mta-gmail',
  MTA_MICROSOFT: 'mta-microsoft',
  MTA_YAHOO: 'mta-yahoo',
  MTA_SEZNAM: 'mta-seznam',
  MTA_VOLNY: 'mta-volny',
  MTA_CENTRUM: 'mta-centrum',
  MTA_OTHER: 'mta-other',
  ARCHIVE_EMAIL_EVENTS: 'archive-email-events',
  SEO_RANK_POLL: 'seo-rank-poll',
  SOCIAL_PUBLISH: 'social-publish',
  SOCIAL_MONITOR: 'social-monitor',
  INVOICE_REMINDER: 'invoice-reminder',
  AD_PERF_SYNC: 'ad-perf-sync',
  VIDEO_TRANSCODE: 'video-transcode',
  SUBSCRIPTION_BILLING: 'subscription-billing',
  ANOMALY_DETECTOR: 'anomaly-detector',
  VIBER_SEND: 'viber-send',
  WHATSAPP_SEND: 'whatsapp-send',
  PUSH_SEND: 'push-send',
  MOBILE_PUSH_SEND: 'mobile-push-send',
  EXTERNAL_FEED_POLL: 'external-feed-poll',
  WARMUP_ADVANCE: 'warmup-advance',
  DKIM_RETIRE: 'dkim-retire',
  DMARC_IMAP_POLL: 'dmarc-imap-poll',
  AB_WINNER: 'ab-winner',
  BLACKLIST_MONITOR: 'blacklist-monitor',
  WORKFLOW_RUN_RESUME: 'workflow-run-resume',
  DAILY_TRIGGERS: 'daily-triggers',
  WAREHOUSE_SYNC: 'warehouse-sync-run',
  CLICKHOUSE_REPLICATE: 'clickhouse-replicate',
  TICKETING_DAY_OF: 'ticketing-day-of',
  TICKETING_FILL_HOUSE: 'ticketing-fill-house',
  TICKETING_DISCOVER: 'ticketing-discover',
  CAMPAIGN_DISPATCH: 'campaign-dispatch',
  BROWSE_ABANDONMENT: 'browse-abandonment-tick',
  SCHEDULED_REPORTS: 'scheduled-reports-run',
  SEGMENT_MEMBERSHIP: 'segment-membership-refresh',
  /**
   * Outgoing webhook delivery. The API has been producing into 'webhook' since
   * the feature was built; this entry was missing, so no Worker was ever
   * constructed for it and nothing consumed the queue.
   */
  WEBHOOK: 'webhook',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Priority constants ──────────────────────────────────────────────────────

export const PRIORITY = {
  TRANSACTIONAL: 1,
  TRIGGERED: 2,
  CAMPAIGN: 3,
} as const;

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

// ─── Message stream type ─────────────────────────────────────────────────────

export type MessageStream = 'broadcast' | 'transactional' | 'triggered';

// ─── Queue instances ─────────────────────────────────────────────────────────

/**
 * These two keep the short default window, and that is not an oversight.
 *
 * Neither is idempotent. Both build their batch jobs and hand them to
 * `addBulk` with no deterministic jobId, so a second run enqueues a second
 * full set — measured: running the splitter twice with the same input left
 * 3 batches, then 6. Every contact in those batches would receive the
 * campaign twice.
 *
 * That inverts the usual trade-off. For batch-sender a longer window buys
 * resilience; here every extra attempt is another chance to duplicate a whole
 * campaign, so widening the window would make the failure mode worse rather
 * than better. The fix is a deterministic jobId per batch — which is a
 * separate change with its own testing, not a config tweak.
 */
export const campaignSplitterQueue = new Queue(QUEUE_NAMES.CAMPAIGN_SPLITTER, defaultOpts);

// ─── Cron queues ─────────────────────────────────────────────────────────────

/**
 * Retry policy for the scheduled (cron) queues.
 *
 * Twenty-five of them were built in their own job files as
 * `new Queue(name, { connection })`. That carries no `defaultJobOptions`, and
 * bullmq 5.73.4 then defaults `attempts` to 0. Its retry check is
 *
 *     this.attemptsMade + 1 < this.opts.attempts
 *
 * so on the first failure that is `0 + 1 < 0` — false. There is no retry, and
 * nothing says so: the job lands in the failed set and the schedule carries on
 * as if the run had happened.
 *
 * The fix is not one number. A job that runs every minute and a job that runs
 * on Monday mornings want opposite things, and one of them wants no retry at
 * all. So the policy is a table, the table lives here, and a queue that is not
 * in it cannot be constructed.
 *
 * The numbers are not invented. Both windows are pinned to figures this repo
 * already measured:
 *   - the shortest cron here is video-transcode at 30 s, which is what bounds
 *     the `frequent` window;
 *   - `BROADCAST_RETRY` below records that an API rolling restart needs about
 *     7¾ minutes to ride out, which is what the `sparse` window has to clear.
 */
export type CronRetryProfile = 'frequent' | 'sparse' | 'once';

export const CRON_RETRY: Record<
  CronRetryProfile,
  { attempts: number; backoff: { type: 'exponential'; delay: number } | undefined }
> = {
  /**
   * Runs every 15 minutes or sooner, and the next run redoes the work.
   *
   * A retry here buys little, so it is one extra attempt rather than a ladder,
   * and the delay is chosen so the retry can never still be running when the
   * next tick starts: 10 s is comfortably inside the shortest schedule on
   * these queues (video-transcode, every 30 s). Two instances of the same
   * sweep running at once is the risk this window exists to avoid.
   *
   * Not zero. "The next tick fixes it" is only true if somebody notices the
   * failures, and today nobody can — the job fails silently. One retry turns
   * a blip into a non-event and leaves a genuine outage still visible in the
   * failed set.
   */
  frequent: { attempts: 2, backoff: { type: 'exponential', delay: 10_000 } },

  /**
   * Runs hourly or less often, and a missed run is not made up.
   *
   * warmup-advance is the clearest case: it advances a warming IP by one day,
   * guarded by `currentDate === today`, so a night it never runs is a day that
   * IP never gets back. Same shape for daily-triggers, the weekly ticketing
   * discovery and the hourly reports.
   *
   * 5 attempts from 60 s is 60 + 120 + 240 + 480 = 900 s, fifteen minutes.
   * That clears the ~7¾ minutes BROADCAST_RETRY records for a rolling API
   * restart, and it is far inside the shortest schedule in this group (one
   * hour), so the ladder cannot overlap the next run either.
   */
  sparse: { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },

  /**
   * Runs once. Deliberately.
   *
   * `attempts: 1` behaves exactly like the `attempts: 0` these queues have
   * today — bullmq runs the job and never retries it. The difference is that
   * 1 is a decision somebody wrote down and 0 is what you get for saying
   * nothing, and the guard test can tell them apart.
   */
  once: { attempts: 1, backoff: undefined },
};

/**
 * Which profile each scheduled queue gets, and why it is not the other one.
 *
 * Grouped by verdict rather than alphabetically, because the verdict is the
 * thing a reader needs.
 */
const CRON_PROFILE: Partial<Record<QueueName, CronRetryProfile>> = {
  // ── Frequent: the next tick redoes the work ────────────────────────────────
  [QUEUE_NAMES.ANOMALY_DETECTOR]: 'frequent', // */5
  [QUEUE_NAMES.SOCIAL_PUBLISH]: 'frequent', // every minute
  [QUEUE_NAMES.SOCIAL_MONITOR]: 'frequent', // */15
  [QUEUE_NAMES.SUBSCRIPTION_BILLING]: 'frequent', // */5
  [QUEUE_NAMES.VIDEO_TRANSCODE]: 'frequent', // every 30 s
  [QUEUE_NAMES.WORKFLOW_RUN_RESUME]: 'frequent', // every minute
  [QUEUE_NAMES.CLICKHOUSE_REPLICATE]: 'frequent', // every minute
  [QUEUE_NAMES.TICKETING_DAY_OF]: 'frequent', // every minute
  [QUEUE_NAMES.CAMPAIGN_DISPATCH]: 'frequent', // every minute (+ hourly reap)
  [QUEUE_NAMES.BROWSE_ABANDONMENT]: 'frequent', // */15
  [QUEUE_NAMES.SEGMENT_MEMBERSHIP]: 'frequent', // */5

  // ── Sparse: a missed run is not made up ────────────────────────────────────
  [QUEUE_NAMES.WARMUP_ADVANCE]: 'sparse', // daily 00:05 — a lost day is lost
  [QUEUE_NAMES.DKIM_RETIRE]: 'sparse', // daily 01:20
  [QUEUE_NAMES.ARCHIVE_EMAIL_EVENTS]: 'sparse', // nightly 03:20
  [QUEUE_NAMES.SEO_RANK_POLL]: 'sparse', // daily 06:00 — a hole in the history
  [QUEUE_NAMES.AD_PERF_SYNC]: 'sparse', // daily 07:00
  [QUEUE_NAMES.DAILY_TRIGGERS]: 'sparse', // daily 06:00
  [QUEUE_NAMES.TICKETING_FILL_HOUSE]: 'sparse', // daily 10:00
  [QUEUE_NAMES.TICKETING_DISCOVER]: 'sparse', // Mon 09:00 — a week to the next
  [QUEUE_NAMES.DMARC_IMAP_POLL]: 'sparse', // every 4 h
  [QUEUE_NAMES.BLACKLIST_MONITOR]: 'sparse', // every 6 h
  [QUEUE_NAMES.EXTERNAL_FEED_POLL]: 'sparse', // hourly
  [QUEUE_NAMES.WAREHOUSE_SYNC]: 'sparse', // hourly :15
  [QUEUE_NAMES.SCHEDULED_REPORTS]: 'sparse', // hourly :05

  /**
   * ── Not idempotent: leave it at one run ──────────────────────────────────
   *
   * DO NOT "fix" this to 'sparse'. `sendDueReminders` in
   * apps/api/src/services/commerce/invoicing.ts selects on due date alone:
   *
   *     eq(invoices.status, 'sent'),
   *     sql`date_trunc('day', ${invoices.dueDate}) = ${targetDateStr}::date`
   *
   * It writes `remindersSent + 1` and `lastReminderAt` afterwards but never
   * reads either back, so nothing in the predicate says "already reminded
   * today". A second run inside the same day re-selects every invoice it just
   * processed and fires `onApiEvent(..., 'invoice_reminder', ...)` again — a
   * second reminder to a paying customer.
   *
   * The per-invoice `catch { /* non-fatal *\/ }` makes this worse rather than
   * better: individual failures are swallowed, so the job only throws when
   * something outside the loop breaks — which is exactly the case where some
   * reminders have already gone out. That is the window the stuck-connection
   * reaper widens: it kills a wedged backend after 15 s, mid-sweep, and hands
   * the worker a failed request with part of the work done.
   *
   * Making this retryable is a real improvement, but it is a change to the
   * SELECT, not to a queue option, and it needs its own test.
   */
  [QUEUE_NAMES.INVOICE_REMINDER]: 'once',
};

/**
 * Build a scheduled queue with the retry policy its schedule calls for.
 *
 * Throws for a name with no entry in CRON_PROFILE, the same way
 * `getMtaQueueByName` throws: a queue whose retry behaviour nobody decided is
 * a wiring bug, and the whole point of this module is that it should not be
 * possible to get one by saying nothing. Failing at import means the worker
 * process refuses to boot rather than running with attempts: 0 again.
 */
export function cronQueue<DataType = unknown>(name: QueueName): Queue<DataType> {
  const profile = CRON_PROFILE[name];
  if (!profile) {
    throw new Error(
      `cronQueue: no retry profile for "${name}". Add it to CRON_PROFILE in ` +
        `queues/index.ts and say which of frequent/sparse/once it is, and why.`,
    );
  }
  return new Queue<DataType>(name, {
    ...defaultOpts,
    defaultJobOptions: { ...defaultOpts.defaultJobOptions, ...CRON_RETRY[profile] },
  });
}

/** Exposed so the guard test can walk every scheduled queue without a Redis. */
export const CRON_QUEUE_NAMES = Object.keys(CRON_PROFILE) as QueueName[];

/** Exposed for the guard test; not for callers, who should use `cronQueue`. */
export function cronProfileOf(name: QueueName): CronRetryProfile | undefined {
  return CRON_PROFILE[name];
}

/**
 * The A/B winner job gets a wider window than `defaultOpts`.
 *
 * It is the only thing that can close an A/B campaign — those arm no batch
 * counter and the reaper skips campaigns without one — so losing it to a
 * transient outage costs a campaign, not just a job. The default 3 attempts
 * from 5 s spans about fifteen seconds, which is shorter than an API pod
 * restarting; every internal call this job makes would fail across it.
 *
 * 5 attempts from 30 s gives 30 + 60 + 120 + 240 = 450 s, about 7½ minutes,
 * matching the broadcast ladder's reasoning. Unlike the splitter, widening this
 * risks no duplicate send: the dispatch ledger refuses batch keys already
 * enqueued, and a replay after a successful dispatch closes the campaign as
 * sent rather than sending anything again.
 *
 * It does not help the deterministic failures — no variant has recorded sends,
 * ab_config lost its variants — which fail identically on every attempt. Those
 * are what the job's terminal handler closes the campaign for.
 */
export const abWinnerQueue = new Queue(QUEUE_NAMES.AB_WINNER, {
  ...defaultOpts,
  defaultJobOptions: {
    ...defaultOpts.defaultJobOptions,
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
  },
});

/**
 * Retry window for a broadcast batch.
 *
 * The protective filters stop the batch when they cannot answer, so this
 * window is what decides whether an ordinary API restart costs a campaign.
 * The previous default — 3 attempts from 5 s — gave 15 s, measured, which is
 * shorter than a pod terminating and passing its readiness probe. A rolling
 * deploy would have killed every batch in flight.
 *
 * 6 attempts from 15 s gives 15 + 30 + 60 + 120 + 240 = 465 s, about 7¾
 * minutes. That covers a rolling deploy with room to spare, and is still far
 * short of the point where a stuck batch should be somebody's problem rather
 * than the retry policy's.
 *
 * It applies only to the batch-sender queues. `defaultOpts` is shared by
 * fourteen others — the splitter, the A/B winner, all seven MTA queues — and
 * widening their windows is a separate decision with different trade-offs.
 */
const BROADCAST_RETRY = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 15_000 },
};

export const batchSenderQueues = {
  broadcast: new Queue(QUEUE_NAMES.BATCH_SENDER, {
    ...defaultOpts,
    defaultJobOptions: { ...defaultOpts.defaultJobOptions, ...BROADCAST_RETRY },
  }),
  transactional: new Queue(QUEUE_NAMES.BATCH_SENDER_TRANSACTIONAL, {
    ...defaultOpts,
    defaultJobOptions: {
      ...defaultOpts.defaultJobOptions,
      // Deliberately NOT the broadcast window. A password reset that arrives
      // eight minutes late is a failed password reset — the user has already
      // asked for another one, or given up. 6 attempts from 2 s gives
      // 2 + 4 + 8 + 16 + 32 = 62 s: one more attempt than before, which is
      // what buys the tail past a brief blip, while the whole window stays
      // inside the minute a person will wait for a reset mail.
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
    },
  }),
  triggered: new Queue(QUEUE_NAMES.BATCH_SENDER_TRIGGERED, {
    ...defaultOpts,
    defaultJobOptions: { ...defaultOpts.defaultJobOptions, ...BROADCAST_RETRY },
  }),
} as const;

/** @deprecated Use batchSenderQueues.broadcast for new code */
export const batchSenderQueue = batchSenderQueues.broadcast;

/**
 * Retry window for a message the receiving server deferred.
 *
 * mta-sender has no retry of its own. It classifies the SMTP reply — block,
 * hard bounce, soft bounce — and for anything retryable it throws, which
 * hands the decision to BullMQ. `isSoftBounce` is "any 4xx", so this window
 * is what a greylisted message gets.
 *
 * Greylisting is the case that made the default wrong. A server that answers
 * 451 wants the sender to come back later, and "later" is conventionally
 * 5 minutes and often 15. The default 3 attempts from 5 s gave up after 15
 * seconds — before the greylist entry had aged even once — so a greylisted
 * message was recorded as a soft bounce and never sent, on a technique that
 * is supposed to cost a legitimate sender nothing.
 *
 * 6 attempts from 60 s gives 60 + 120 + 240 + 480 + 960 = 1860 s, 31 minutes.
 * That clears normal greylisting with room to spare and rides out the 421/451
 * throttle signals the adaptive rate limiter is already reacting to. It is
 * still short compared with a real MTA, which retries for days — this queue
 * is not trying to be one, only to stop losing mail to a five-minute delay.
 */
const mtaOpts: QueueOptions = {
  ...defaultOpts,
  defaultJobOptions: {
    ...defaultOpts.defaultJobOptions,
    attempts: 6,
    // 'stream' is not a builtin, so BullMQ resolves it through the worker's
    // settings.backoffStrategy — see lib/stream-backoff.ts for the ladders and
    // why transactional, triggered and broadcast do not want the same one.
    backoff: { type: 'stream' },
  },
};

export const mtaQueues = {
  gmail: new Queue(QUEUE_NAMES.MTA_GMAIL, mtaOpts),
  microsoft: new Queue(QUEUE_NAMES.MTA_MICROSOFT, mtaOpts),
  yahoo: new Queue(QUEUE_NAMES.MTA_YAHOO, mtaOpts),
  seznam: new Queue(QUEUE_NAMES.MTA_SEZNAM, mtaOpts),
  volny: new Queue(QUEUE_NAMES.MTA_VOLNY, mtaOpts),
  centrum: new Queue(QUEUE_NAMES.MTA_CENTRUM, mtaOpts),
  other: new Queue(QUEUE_NAMES.MTA_OTHER, mtaOpts),
} as const;

export type IspName = keyof typeof mtaQueues;

// ─── Job data types ──────────────────────────────────────────────────────────

/**
 * Time-warp config — when set, the worker queries the API for a per-contact
 * send time aligned to each contact's IANA timezone, then schedules the MTA
 * job with a BullMQ `delay` so it fires at the correct UTC instant. Contacts
 * without a known tz fall back to `fallbackTimezone`.
 */
export interface TimewarpConfig {
  enabled: boolean;
  /** Local hour 0-23 in the recipient's timezone. */
  localHour: number;
  /** ISO 8601 date used as the "day" anchor; the worker uses today if absent. */
  baseDate?: string;
  /** IANA tz for contacts whose timezone is unknown (defaults to Europe/Prague). */
  fallbackTimezone?: string;
  /** Skip CZ/SK public holidays — shift the send to the next working day. */
  skipHolidays?: boolean;
  /** Holiday calendar to use when skipHolidays is set. Defaults to 'cz'. */
  holidayCountry?: 'cz' | 'sk';
}

export interface CampaignSplitterJobData {
  campaignId: string;
  orgId: string;
  listId: string;
  segmentId?: string;
  excludeSegmentId?: string;
  /** Content (block JSON) + subject + from/to for rendering */
  content: Record<string, unknown>;
  subject: string;
  preheader?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  /** DKIM config for signing */
  dkimDomain?: string;
  dkimSelector?: string;
  dkimPrivateKey?: string;
  /** A/B test config (optional) */
  abConfig?: Record<string, unknown>;
  /** Time-warp config (optional) — see TimewarpConfig */
  timewarp?: TimewarpConfig;
  priority: Priority;
  stream?: MessageStream;
  /** UTM auto-append (from campaign.utmTracking) */
  utmTracking?: {
    enabled?: boolean;
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  /** CAN-SPAM sender legal name + physical postal address (footer). */
  companyName?: string;
  companyAddress?: string;
  /** Org-wide custom footer (SendGrid Mail Settings) appended to every email. */
  footerHtml?: string;
  footerText?: string;
  /**
   * Language of this campaign, for the strings the renderer adds itself — the
   * unsubscribe label today. Absent means English.
   */
  locale?: 'en' | 'cs' | 'sk';
  /** Per-domain tracking defaults — gate open-pixel / link-wrap injection. */
  openTracking?: boolean;
  clickTracking?: boolean;
  /** Configuration-set IP pool + TLS policy (threaded to the MTA). */
  ipPoolId?: string;
  tlsPolicy?: string;
  /** GDPR processing purpose the campaign sends under. Null when the org
   *  does not use purposes; the consent pre-check is inert in that case. */
  processingPurposeId?: string | null;
}

export interface BatchSenderJobData {
  campaignId: string;
  orgId: string;
  batchIndex: number;
  /**
   * Which dispatch and which batch within it — the ledger row this job is the
   * work for. Carried explicitly rather than parsed back out of the BullMQ
   * jobId (`${dispatchId}:${batchKey}`, and dispatchId itself contains a colon),
   * because the job has to be able to say which batch finished and a jobId
   * format is not a contract.
   *
   * Optional: jobs enqueued before this field existed are still in flight, and
   * a batch that cannot identify itself simply does not report — the reaper
   * closes those campaigns rather than the counter.
   */
  dispatchId?: string;
  batchKey?: string;
  /**
   * How many times this batch has been put back because its campaign was
   * paused, and how long that has added up to. Carried on the job rather than
   * derived from `attemptsMade`, because a delay is deliberately not an attempt
   * — measured: 100 delays leave attemptsMade at 0 — so the retry counter says
   * nothing about how long a batch has been waiting.
   */
  pauseDelays?: number;
  pauseWaitedMs?: number;
  /** Contact IDs in this batch */
  contactIds: string[];
  content: Record<string, unknown>;
  subject: string;
  preheader?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  dkimDomain?: string;
  dkimSelector?: string;
  dkimPrivateKey?: string;
  /** Time-warp config (optional) — applied per-contact in batch-sender */
  timewarp?: TimewarpConfig;
  priority: Priority;
  stream: MessageStream;
  /** A/B variant id to tag on email_events rows. Null for non-A/B sends. */
  abVariantId?: string;
  /** UTM auto-append config from campaign. Applied at render time. */
  utmTracking?: {
    enabled?: boolean;
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  /** CAN-SPAM sender legal name + physical postal address (footer). */
  companyName?: string;
  companyAddress?: string;
  /** Org-wide custom footer (SendGrid Mail Settings) appended to every email. */
  footerHtml?: string;
  footerText?: string;
  /**
   * Language of this campaign, for the strings the renderer adds itself — the
   * unsubscribe label today. Absent means English.
   */
  locale?: 'en' | 'cs' | 'sk';
  /** Per-domain tracking defaults — gate open-pixel / link-wrap injection. */
  openTracking?: boolean;
  clickTracking?: boolean;
  /** Configuration-set IP pool + TLS policy (threaded to the MTA). */
  ipPoolId?: string;
  tlsPolicy?: string;
  /** GDPR processing purpose the campaign sends under. Null when the org
   *  does not use purposes; the consent pre-check is inert in that case. */
  processingPurposeId?: string | null;
}

export interface MtaSendJobData {
  campaignId: string;
  orgId: string;
  contactId: string;
  messageId: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  customHeaders: Record<string, string>;
  dkimDomain?: string;
  dkimSelector?: string;
  dkimPrivateKey?: string;
  /** Source IP resolved from the org's dedicated pool ('' = engine default). */
  sendingIp?: string;
  /** VERP envelope sender (Return-Path). '' = use From. */
  returnPath?: string;
  /** TLS policy: 'require' aborts if no STARTTLS; else opportunistic. */
  tlsPolicy?: string;
  /** Raw RFC 5322 MIME — relayed verbatim by the engine when set. */
  rawMime?: string;
  priority: Priority;
  stream: MessageStream;
  /** A/B variant id propagated from BatchSenderJobData for event tagging. */
  abVariantId?: string;

  /**
   * Times this message has been put to sleep on purpose, by reason. Deferrals
   * do not consume BullMQ attempts (moveToDelayed skips them), so nothing else
   * bounds them — see lib/defer.ts.
   */
  deferrals?: { throttle?: number; warmup_quota?: number };
  /**
   * File attachments (e-ticket PDFs etc.). Content is base64 so the job stays
   * JSON-serialisable through Redis/BullMQ; decoded to a Buffer at send time.
   */
  attachments?: Array<{
    filename: string;
    contentType: string;
    contentBase64: string;
    contentId?: string;
    inline?: boolean;
  }>;
}

export interface AbWinnerJobData {
  campaignId: string;
  orgId: string;
  /** Subject line of the winning variant — resolved by the worker after computing winner. */
  winnerSubject?: string;
  winnerPreheader?: string;
  winnerContent?: Record<string, unknown>;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  dkimDomain?: string;
  dkimSelector?: string;
  dkimPrivateKey?: string;
  priority?: number;
}

/**
 * ISP detection — maps recipient domain to the correct MTA queue.
 * CZ ISPs (Seznam, Volny, Centrum) get dedicated queues so their
 * specific rate limits and ISP-aware headers (X-Seznam-Campaign-Category)
 * apply correctly. Mirrors ResolveIsp() in apps/engine/internal/email/headers.go.
 */
const ISP_DOMAINS: Record<string, IspName> = {
  // Google
  'gmail.com': 'gmail',
  'googlemail.com': 'gmail',
  'google.com': 'gmail',
  // Microsoft
  'outlook.com': 'microsoft',
  'hotmail.com': 'microsoft',
  'live.com': 'microsoft',
  'msn.com': 'microsoft',
  'outlook.cz': 'microsoft',
  // Yahoo
  'yahoo.com': 'yahoo',
  'yahoo.co.uk': 'yahoo',
  'ymail.com': 'yahoo',
  'aol.com': 'yahoo',
  // Seznam (CZ — largest local mailbox provider)
  'seznam.cz': 'seznam',
  'email.cz': 'seznam',
  // Volny (CZ)
  'volny.cz': 'volny',
  // Centrum (CZ)
  'centrum.cz': 'centrum',
  'post.cz': 'centrum',
};

export function detectIsp(recipientDomain: string): IspName {
  return ISP_DOMAINS[recipientDomain.toLowerCase()] ?? 'other';
}

export function getMtaQueue(isp: IspName): Queue {
  return mtaQueues[isp];
}

/** Redis queue name → the canonical Queue object, built once from mtaQueues. */
const MTA_QUEUE_BY_NAME: ReadonlyMap<string, Queue> = new Map(
  Object.values(mtaQueues).map((q) => [q.name, q] as const),
);

/**
 * The canonical Queue object for an MTA queue name.
 *
 * Exists so a consumer that only knows `job.queueName` can put a message back
 * without constructing its own Queue. An ad-hoc `new Queue(name, { connection })`
 * carries no defaultJobOptions, and BullMQ then defaults `attempts` to 0 —
 * which is how the throttle deferral used to strip a message's whole retry
 * window. Throws rather than falling back: the only caller is the MTA worker,
 * which runs on exactly these queues, so an unknown name is a wiring bug and
 * should not be papered over with a queue that has no policy.
 */
export function getMtaQueueByName(name: string): Queue {
  const q = MTA_QUEUE_BY_NAME.get(name);
  if (!q) {
    throw new Error(
      `getMtaQueueByName: "${name}" is not an MTA queue (known: ${[...MTA_QUEUE_BY_NAME.keys()].join(', ')})`,
    );
  }
  return q;
}

/**
 * Route a job to the correct batch-sender queue based on stream.
 * Transactional and triggered streams get dedicated queues so bulk broadcast
 * traffic never blocks time-sensitive sends.
 */
export function getBatchSenderQueue(stream: MessageStream): Queue {
  return batchSenderQueues[stream];
}
