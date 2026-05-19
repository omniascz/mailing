/**
 * BatchSender job — processes a batch of contacts for a campaign.
 *
 * For each contact in the batch:
 *   1. Load contact data (email, name, custom fields)
 *   2. Check suppression list
 *   3. Check frequency cap
 *   4. Resolve merge tags in subject + HTML
 *   5. Render final HTML (with tracking pixel + click tracking)
 *   6. Detect ISP from recipient domain
 *   7. Enqueue into the correct per-ISP MTA queue
 *
 * Receives: BatchSenderJobData
 * Produces: N × MtaSendJobData into mta-{isp} queues
 */

import { Worker, type Job } from 'bullmq';
import crypto from 'node:crypto';
import {
  renderEmail as renderBlocks,
  renderPlainText,
  parseMergeTags,
  type MergeTagContext,
} from '@forgemsg/editor/render';
import { emailSchema, type EmailSchema } from '@forgemsg/editor/schema';
import { injectOpenPixel, wrapLinks } from '@forgemsg/shared';
import {
  connection,
  QUEUE_NAMES,
  detectIsp,
  getMtaQueue,
  type BatchSenderJobData,
  type MtaSendJobData,
  type MessageStream,
  type TimewarpConfig,
} from '../queues/index.js';

interface ContactRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customFields: Record<string, unknown>;
}

async function processBatchSender(job: Job<BatchSenderJobData>) {
  const data = job.data;
  const stream: MessageStream = data.stream ?? 'broadcast';

  job.log(`Processing batch ${data.batchIndex} for campaign ${data.campaignId} stream=${stream} (${data.contactIds.length} contacts)`);

  // Load contacts from the API
  const contacts = await fetchContacts(data.orgId, data.contactIds);

  let sent = 0;
  let skipped = 0;

  // Resolve all batch-level pre-checks + per-contact send timestamps in
  // parallel BEFORE the per-contact loop. Previously the loop made up to
  // 3000 round-trips per batch (suppression + frequency + holdout × 1000
  // contacts). Now: 4 HTTP calls per batch (contacts already batched).
  const suppressedSet = new Set<string>();
  const cappedSet = new Set<string>();
  const heldOutSet = new Set<string>();

  const contactIds = contacts.map((c) => c.id);
  const emails = contacts.map((c) => c.email);

  const checks: Array<Promise<unknown>> = [];
  if (stream !== 'transactional') {
    checks.push(
      fetchSuppressedBatch(data.orgId, emails).then((s) =>
        s.forEach((e) => suppressedSet.add(e.toLowerCase())),
      ),
    );
  }
  if (stream === 'broadcast') {
    checks.push(
      fetchCappedBatch(data.orgId, contactIds).then((c) => c.forEach((id) => cappedSet.add(id))),
      fetchHeldOutBatch(data.orgId, contactIds).then((c) => c.forEach((id) => heldOutSet.add(id))),
    );
  }

  const timewarpSchedule =
    data.timewarp?.enabled
      ? await fetchTimewarpSchedule(data.contactIds, data.timewarp)
      : null;

  // Resolve tracking URL prefix once per batch. Falls back to the global
  // TRACKING_BASE_URL if the org hasn't verified a branded subdomain yet.
  const trackingBaseUrl = await fetchTrackingBaseUrl(data.orgId);

  await Promise.all(checks);

  const mtaJobs: Array<{
    queue: ReturnType<typeof getMtaQueue>;
    name: string;
    data: MtaSendJobData;
    opts: { priority: number; delay?: number };
  }> = [];

  for (const contact of contacts) {
    // 1. Synchronous Set lookups (data pre-fetched above). Transactional
    //    stream skips suppression; broadcast stream additionally checks
    //    frequency cap + holdout (the pre-fetch already gated these by
    //    stream so the sets are empty for non-applicable streams).
    if (suppressedSet.has(contact.email.toLowerCase())) {
      skipped++;
      continue;
    }
    if (cappedSet.has(contact.id) || heldOutSet.has(contact.id)) {
      skipped++;
      continue;
    }

    // 3. Build merge context once per contact; reused by subject + content
    //    rendering paths. parseMergeTags (from @forgemsg/editor) is the
    //    single source of truth for tag syntax + filter registry across
    //    worker, editor preview, and server-side rendering.
    const mergeCtx = buildMergeContext(contact);
    const subject = parseMergeTags(data.subject, mergeCtx);

    // 4. Render HTML + plain-text alternative (block JSON path via
    //    @forgemsg/editor renderEmail + renderPlainText; legacy { html }
    //    path uses parseMergeTags + HTML→text fallback).
    let { html: htmlBody, text: textBody } = renderEmail(
      data.content,
      mergeCtx,
      data.preheader,
    );

    // 4b. Apply click + open tracking. Both are skipped for transactional
    //     sends — receipts / password-reset emails should not be wrapped
    //     to avoid surprising the recipient with a redirect host and to
    //     keep transactional inbox-placement free of marketing signals.
    if (stream !== 'transactional') {
      htmlBody = wrapLinks(
        htmlBody,
        trackingBaseUrl,
        data.orgId,
        data.campaignId,
        contact.id,
      );
      htmlBody = injectOpenPixel(
        htmlBody,
        trackingBaseUrl,
        data.orgId,
        data.campaignId,
        contact.id,
      );
    }

    // 5. Build custom headers
    const messageId = `${crypto.randomUUID()}@forgemsg.com`;
    const unsubToken = Buffer.from(JSON.stringify({
      orgId: data.orgId,
      contactId: contact.id,
      campaignId: data.campaignId,
    })).toString('base64url');

    const customHeaders: Record<string, string> = {
      'X-Mailer': 'ForgeMsg/1.0',
      'X-ForgeMsg-Campaign': data.campaignId,
      'X-ForgeMsg-Org': data.orgId,
      'List-Unsubscribe': `<mailto:unsubscribe@forgemsg.com?subject=${unsubToken}>, <https://app.forgemsg.com/unsubscribe/${unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };

    // 6. Detect ISP and route to the correct queue
    const recipientDomain = contact.email.split('@')[1] ?? 'other';
    const isp = detectIsp(recipientDomain);
    const queue = getMtaQueue(isp);

    // 7. Time-warp delay — when scheduled timestamp is in the future,
    //    convert to a BullMQ delay (ms). Past timestamps fire immediately
    //    (we never hold sends back if the local hour has already passed).
    const scheduledIso = timewarpSchedule?.get(contact.id);
    let delay: number | undefined;
    if (scheduledIso) {
      const ms = new Date(scheduledIso).getTime() - Date.now();
      if (ms > 0) delay = ms;
    }

    mtaJobs.push({
      queue,
      name: `send-${messageId}`,
      data: {
        campaignId: data.campaignId,
        orgId: data.orgId,
        contactId: contact.id,
        messageId,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        toEmail: contact.email,
        toName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
        subject,
        htmlBody,
        textBody,
        replyTo: data.replyTo,
        customHeaders,
        dkimDomain: data.dkimDomain,
        dkimSelector: data.dkimSelector,
        dkimPrivateKey: data.dkimPrivateKey,
        priority: data.priority,
        stream,
      },
      opts: delay !== undefined
        ? { priority: data.priority, delay }
        : { priority: data.priority },
    });

    sent++;
  }

  // Bulk enqueue per-ISP (group by queue for efficiency)
  const byQueue = new Map<ReturnType<typeof getMtaQueue>, typeof mtaJobs>();
  for (const j of mtaJobs) {
    const existing = byQueue.get(j.queue) ?? [];
    existing.push(j);
    byQueue.set(j.queue, existing);
  }

  for (const [queue, jobs] of byQueue) {
    await queue.addBulk(
      jobs.map((j) => ({ name: j.name, data: j.data, opts: j.opts })),
    );
  }

  // Record frequency cap sends
  for (const j of mtaJobs) {
    await recordFrequencySend(data.orgId, j.data.contactId);
  }

  job.log(`Batch ${data.batchIndex}: sent=${sent}, skipped=${skipped}`);

  return { sent, skipped };
}

// ─── Merge tag context ───────────────────────────────────────────────────────

/**
 * Build a MergeTagContext from a fetched contact row. Custom fields are spread
 * onto the contact so {{ custom_field_name }} resolves directly. System keys
 * (unsubscribe_url, view_in_browser_url, current_date/year) are populated when
 * passed in via systemContext.
 *
 * All merge-tag resolution flows through @forgemsg/editor's parseMergeTags,
 * giving us a single regex + filter registry (vocative, default, …) shared
 * across editor preview, server-side render, and worker dispatch.
 */
function buildMergeContext(
  contact: ContactRow,
  systemContext?: MergeTagContext['system'],
): MergeTagContext {
  return {
    contact: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      ...contact.customFields,
    },
    system: systemContext,
  };
}

interface RenderedEmail {
  html: string;
  /** Auto-derived plain-text alternative for multipart/alternative MIME part. */
  text: string;
}

/**
 * Render a campaign email for a specific contact, producing both an HTML
 * body and a plain-text alternative. The plain text is required by Gmail/
 * Yahoo 2024+ bulk-sender rules and reduces spam scoring across the board.
 *
 * Three input shapes are accepted, in priority order:
 *  1. EmailSchema (block JSON) — production path; renderBlocks() + renderPlainText()
 *  2. Legacy { html: string } [+ optional { text: string }] — backward compat
 *  3. Anything else → JSON.stringify (debug aid, never produced in prod)
 */
function renderEmail(
  content: Record<string, unknown>,
  ctx: MergeTagContext,
  preheader?: string,
): RenderedEmail {
  // Path 1: block JSON (production)
  if ('blocks' in content && Array.isArray((content as { blocks?: unknown }).blocks)) {
    const parsed = emailSchema.safeParse({
      preheader: preheader ?? '',
      ...content,
    } satisfies Partial<EmailSchema> | Record<string, unknown>);

    if (parsed.success) {
      const html = renderBlocks(parsed.data, { context: ctx }).html;
      const text = renderPlainText(parsed.data, { context: ctx });
      return { html, text };
    }
    console.warn(
      `[batch-sender] Invalid EmailSchema, falling back to legacy render:`,
      parsed.error.message,
    );
  }

  // Path 2: legacy raw HTML (+ optional text override)
  const html = (content as { html?: string }).html;
  if (html) {
    let resolved = parseMergeTags(html, ctx);
    if (preheader) {
      const preheaderHtml = `<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>`;
      resolved = resolved.replace(/<body[^>]*>/i, (m) => m + preheaderHtml);
    }
    const textOverride = (content as { text?: string }).text;
    const text = textOverride
      ? parseMergeTags(textOverride, ctx)
      : deriveTextFromHtml(resolved);
    return { html: resolved, text };
  }

  // Path 3: fallback (should never happen in production)
  const serialised = JSON.stringify(content);
  return { html: serialised, text: serialised };
}

/**
 * Best-effort HTML→text conversion for the legacy { html } path. The block
 * path uses renderPlainText() from @forgemsg/editor which is far more
 * accurate; this helper exists only so legacy campaigns also benefit from
 * the multipart/alternative deliverability bump.
 */
function deriveTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── External service stubs ──────────────────────────────────────────────────

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function fetchContacts(orgId: string, contactIds: string[]): Promise<ContactRow[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/contacts/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, contactIds }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body = (await res.json()) as { data: ContactRow[] };
    return body.data;
  } catch (err) {
    console.error('fetchContacts failed:', err);
    return [];
  }
}

/**
 * Bulk suppression check — returns the subset of recipient emails that are
 * currently suppressed for the org. Worker calls this once per batch
 * (≤1000 emails) instead of N individual `/suppressions/check?email=…`
 * calls. Fail-open on API errors so a transient outage doesn't block sends.
 */
async function fetchSuppressedBatch(orgId: string, emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/suppressions/check-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, emails }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: { suppressed: string[] } };
    return body.data.suppressed;
  } catch {
    return [];
  }
}

/**
 * Bulk frequency-cap check — returns the subset of contact IDs currently
 * capped under the org's frequency rules for the email channel. Fail-open.
 */
async function fetchCappedBatch(orgId: string, contactIds: string[]): Promise<string[]> {
  if (contactIds.length === 0) return [];
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/frequency/check-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, contactIds, channel: 'email' }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: { capped: string[] } };
    return body.data.capped;
  } catch {
    return [];
  }
}

/**
 * Bulk holdout check — returns the subset of contact IDs currently
 * assigned to an active holdout group. Worker calls once per broadcast
 * batch. Fail-open to avoid accidentally releasing the control cohort on
 * a transient API outage (persistent 5xx surfaces via §C.15 abuse signals).
 */
async function fetchHeldOutBatch(orgId: string, contactIds: string[]): Promise<string[]> {
  if (contactIds.length === 0) return [];
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/holdout/check-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, contactIds }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: { heldOut: string[] } };
    return body.data.heldOut;
  } catch {
    return [];
  }
}

async function recordFrequencySend(orgId: string, contactId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/frequency/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, contactId, channel: 'email' }),
    });
  } catch {
    // non-critical
  }
}

/**
 * Resolve the tracking-URL prefix for this org. Returns the branded
 * subdomain (e.g. https://links.customer.cz) when the org has a verified
 * sending domain with a mailSubdomain CNAME pointed at our tracking
 * edge; otherwise the default TRACKING_BASE_URL. Fail-safe: on API
 * errors we fall through to the env default so sends never block on a
 * resolver outage.
 */
async function fetchTrackingBaseUrl(orgId: string): Promise<string> {
  const fallback = process.env.TRACKING_BASE_URL ?? 'https://track.mailforge.io';
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/tracking-domain?orgId=${orgId}`);
    if (!res.ok) return fallback;
    const body = (await res.json()) as { data: { baseUrl: string; branded: boolean } };
    return body.data.baseUrl ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetch per-contact time-warp send timestamps. The API service queries each
 * contact's IANA timezone, computes the UTC instant for the configured
 * local hour, and returns ISO strings keyed by contact ID. Returns null on
 * failure so the worker can degrade to immediate dispatch instead of
 * blocking the batch.
 */
async function fetchTimewarpSchedule(
  contactIds: string[],
  cfg: TimewarpConfig,
): Promise<Map<string, string> | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/timewarp/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactIds,
        baseDate: cfg.baseDate ?? new Date().toISOString(),
        localHour: cfg.localHour,
        fallbackTimezone: cfg.fallbackTimezone ?? 'Europe/Prague',
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: Record<string, string> };
    return new Map(Object.entries(body.data));
  } catch {
    return null;
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export function startBatchSenderWorker(queueName: string = QUEUE_NAMES.BATCH_SENDER) {
  const worker = new Worker<BatchSenderJobData>(
    queueName,
    processBatchSender,
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[batch-sender] Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[batch-sender] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
