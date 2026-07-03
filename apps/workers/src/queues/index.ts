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

export const campaignSplitterQueue = new Queue(QUEUE_NAMES.CAMPAIGN_SPLITTER, defaultOpts);
export const abWinnerQueue = new Queue(QUEUE_NAMES.AB_WINNER, defaultOpts);

export const batchSenderQueues = {
  broadcast: new Queue(QUEUE_NAMES.BATCH_SENDER, defaultOpts),
  transactional: new Queue(QUEUE_NAMES.BATCH_SENDER_TRANSACTIONAL, {
    ...defaultOpts,
    defaultJobOptions: {
      ...defaultOpts.defaultJobOptions,
      // Transactional jobs get more retry attempts with shorter backoff
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    },
  }),
  triggered: new Queue(QUEUE_NAMES.BATCH_SENDER_TRIGGERED, defaultOpts),
} as const;

/** @deprecated Use batchSenderQueues.broadcast for new code */
export const batchSenderQueue = batchSenderQueues.broadcast;

export const mtaQueues = {
  gmail: new Queue(QUEUE_NAMES.MTA_GMAIL, defaultOpts),
  microsoft: new Queue(QUEUE_NAMES.MTA_MICROSOFT, defaultOpts),
  yahoo: new Queue(QUEUE_NAMES.MTA_YAHOO, defaultOpts),
  seznam: new Queue(QUEUE_NAMES.MTA_SEZNAM, defaultOpts),
  volny: new Queue(QUEUE_NAMES.MTA_VOLNY, defaultOpts),
  centrum: new Queue(QUEUE_NAMES.MTA_CENTRUM, defaultOpts),
  other: new Queue(QUEUE_NAMES.MTA_OTHER, defaultOpts),
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
  utmTracking?: { enabled?: boolean; source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  /** CAN-SPAM sender legal name + physical postal address (footer). */
  companyName?: string;
  companyAddress?: string;
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
  utmTracking?: { enabled?: boolean; source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  /** CAN-SPAM sender legal name + physical postal address (footer). */
  companyName?: string;
  companyAddress?: string;
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
  priority: Priority;
  stream: MessageStream;
  /** A/B variant id propagated from BatchSenderJobData for event tagging. */
  abVariantId?: string;
  /** How many times this message has been deferred by the adaptive ISP throttle. */
  throttleAttempts?: number;
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

/**
 * Route a job to the correct batch-sender queue based on stream.
 * Transactional and triggered streams get dedicated queues so bulk broadcast
 * traffic never blocks time-sensitive sends.
 */
export function getBatchSenderQueue(stream: MessageStream): Queue {
  return batchSenderQueues[stream];
}
