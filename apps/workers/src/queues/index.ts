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

const defaultOpts: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000, age: 86_400 },
    removeOnFail: { count: 5000, age: 7 * 86_400 },
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
export const abWinnerQueue = new Queue(QUEUE_NAMES.AB_WINNER, defaultOpts);

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
