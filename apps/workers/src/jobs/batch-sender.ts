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
import { captureJobException } from '../lib/telemetry.js';
import crypto from 'node:crypto';
import {
  renderEmail as renderBlocks,
  renderPlainText,
  parseMergeTags,
  type MergeTagContext,
} from '@forgemsg/editor/render';
import { emailSchema, type EmailSchema } from '@forgemsg/editor/schema';
import { injectOpenPixel, wrapLinks, createTrackingToken } from '@forgemsg/shared';
// Cross-package import (same pattern as mta-sender → isp-throttle): the coupon
// resolver assigns a unique per-contact code for {{coupon_code:batchId}} tags.
import { resolveEmailCouponTags } from '@forgemsg/api/services/campaigns/email-coupon-merge';
import { encodeVerp } from '@forgemsg/shared/sending/verp';
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

  job.log(
    `Processing batch ${data.batchIndex} for campaign ${data.campaignId} stream=${stream} (${data.contactIds.length} contacts)`,
  );

  // Platform-admin suspended this org while jobs were already enqueued —
  // skip the whole batch. Plan-enforcement on POST /campaigns/:id/send
  // catches new sends, this catches in-flight ones.
  if (await fetchOrgSuspended(data.orgId)) {
    job.log(`[suspended] Org ${data.orgId} is suspended by platform admin. Skipping batch.`);
    return { sent: 0, skipped: data.contactIds.length, reason: 'org_suspended' };
  }

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

  const timewarpSchedule = data.timewarp?.enabled
    ? await fetchTimewarpSchedule(data.orgId, data.contactIds, data.timewarp)
    : null;

  // Newsletter tier names — fetched once per batch for DynamicBlock gating
  const newsletterTierMap = await fetchNewsletterTierNames(data.orgId, contactIds);

  // Resolve tracking URL prefix once per batch. Falls back to the global
  // TRACKING_BASE_URL if the org hasn't verified a branded subdomain yet.
  const trackingBaseUrl = await fetchTrackingBaseUrl(data.orgId);

  // Resolve the org's dedicated sending IP once per batch (least-loaded from
  // its pool). Empty → the engine picks from the default/shared pool. This
  // wires org→pool→IP through to the MTA (previously sendingIp was hardcoded '').
  let sendingIp = '';
  try {
    const { pickIpForSend } = await import('@forgemsg/api/services/dedicated-ips');
    // Use the configuration set's IP pool when the campaign specifies one.
    const ip = await pickIpForSend(data.orgId, data.ipPoolId);
    sendingIp = ip?.ipAddress ?? '';
  } catch {
    sendingIp = '';
  }

  // VERP bounce domain — when set, each message gets a Return-Path encoding its
  // messageId so out-of-band bounces to that address are attributable.
  const verpBounceDomain = process.env.VERP_BOUNCE_DOMAIN ?? '';

  // Sprint D.8 — ePrivacy strict mode. When the org has opted into the
  // stricter EU regime, we ONLY apply click/open tracking to recipients
  // who recorded explicit consent on the 'tracking' channel. Outside
  // strict mode the worker tracks every non-transactional recipient
  // under the org's legitimate-interest claim (the pre-D.8 behaviour).
  const trackingStrict = await fetchTrackingStrict(data.orgId);
  const trackingOptedIn =
    trackingStrict && stream !== 'transactional'
      ? await fetchOptedInForTracking(data.orgId, contactIds)
      : null;

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
    //
    //    System context fields are populated here:
    //    - unsubscribe_url: legacy one-click unsub (still List-Unsubscribe
    //      header backing); will eventually point at the same preference
    //      center hostname once the redirect page ships.
    //    - preference_center_url: signed pref token under /p/center/. The
    //      recipient lands on a list-by-list opt-out page (D.1).
    //    - current_date / current_year: cheap convenience tags.
    const prefToken = createTrackingToken({
      type: 'pref',
      orgId: data.orgId,
      contactId: contact.id,
      ts: Math.floor(Date.now() / 1000),
    });
    const prefCenterUrl = `${trackingBaseUrl}/p/center/${prefToken}`;
    // Signed, stateless one-click unsubscribe token (RFC 8058). Same HMAC
    // scheme as the tracking/pref tokens — no per-recipient Redis write.
    const unsubToken = createTrackingToken({
      type: 'unsub',
      orgId: data.orgId,
      contactId: contact.id,
      campaignId: data.campaignId,
      ts: Math.floor(Date.now() / 1000),
    });
    const unsubscribeUrl = `${trackingBaseUrl}/api/v1/unsubscribe/${unsubToken}`;
    // Signed view-in-browser token → hosted re-render of this exact email.
    const viewToken = createTrackingToken({
      type: 'view',
      orgId: data.orgId,
      campaignId: data.campaignId,
      contactId: contact.id,
      ts: Math.floor(Date.now() / 1000),
    });
    const viewInBrowserUrl = `${trackingBaseUrl}/api/v1/browser/${viewToken}`;
    const todayIso = new Date().toISOString().slice(0, 10);
    const mergeCtx = buildMergeContext(
      contact,
      {
        preferenceCenterUrl: prefCenterUrl,
        unsubscribeUrl,
        viewInBrowserUrl,
        currentDate: todayIso,
        currentYear: String(new Date().getFullYear()),
        companyName: data.companyName,
        companyAddress: data.companyAddress,
        footerHtml: data.footerHtml,
        footerText: data.footerText,
      },
      newsletterTierMap.get(contact.id),
    );
    let subject = parseMergeTags(data.subject, mergeCtx);

    // 4. Render HTML + plain-text alternative (block JSON path via
    //    @forgemsg/editor renderEmail + renderPlainText; legacy { html }
    //    path uses parseMergeTags + HTML→text fallback).
    const rendered = renderEmail(data.content, mergeCtx, data.preheader, data.utmTracking);
    let htmlBody = rendered.html;
    let textBody = rendered.text;

    // 4a. Resolve unique-coupon merge tags ({{coupon_code:batchId}}) into this
    //     contact's assigned code. parseMergeTags leaves the tag untouched (the
    //     ':' is outside its field grammar), so we resolve on the rendered
    //     output — works for both block-JSON and legacy paths. Runs BEFORE link
    //     wrapping so a code embedded in a URL is wrapped with the real value.
    //     No-op (same string, no DB hit) when the content has no coupon tags.
    subject = await resolveEmailCouponTags(subject, data.orgId, contact.id);
    htmlBody = await resolveEmailCouponTags(htmlBody, data.orgId, contact.id);
    textBody = await resolveEmailCouponTags(textBody, data.orgId, contact.id);

    // 4b. Apply click + open tracking. Both are skipped for transactional
    //     sends — receipts / password-reset emails should not be wrapped
    //     to avoid surprising the recipient with a redirect host and to
    //     keep transactional inbox-placement free of marketing signals.
    //
    //     Sprint D.8: in ePrivacy strict mode, additionally gate tracking
    //     on the recipient having opted into the 'tracking' channel.
    //     Non-strict orgs keep the pre-D.8 behaviour (track everyone on
    //     non-transactional streams).
    const trackingAllowed =
      stream !== 'transactional' && (!trackingOptedIn || trackingOptedIn.has(contact.id));

    if (trackingAllowed) {
      // Per-domain toggles gate each tracking kind independently (default on).
      if (data.clickTracking !== false) {
        htmlBody = wrapLinks(htmlBody, trackingBaseUrl, data.orgId, data.campaignId, contact.id);
      }
      if (data.openTracking !== false) {
        htmlBody = injectOpenPixel(
          htmlBody,
          trackingBaseUrl,
          data.orgId,
          data.campaignId,
          contact.id,
        );
      }
    }

    // 5. Build custom headers. The List-Unsubscribe https URL is the API
    //    endpoint that also accepts the RFC 8058 one-click POST — same token
    //    backs the {{unsubscribe_url}} merge tag above.
    const messageId = `${crypto.randomUUID()}@forgemsg.com`;

    const customHeaders: Record<string, string> = {
      'X-Mailer': 'ForgeMsg/1.0',
      'X-ForgeMsg-Campaign': data.campaignId,
      'X-ForgeMsg-Org': data.orgId,
      'List-Unsubscribe': `<mailto:unsubscribe@forgemsg.com?subject=${unsubToken}>, <${unsubscribeUrl}>`,
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
        sendingIp,
        tlsPolicy: data.tlsPolicy,
        // VERP Return-Path: encode the messageId so out-of-band bounces are
        // attributable (decoded on inbound by decodeVerp). Only when a bounce
        // domain is configured.
        returnPath: verpBounceDomain ? encodeVerp(messageId, verpBounceDomain) : '',
        priority: data.priority,
        stream,
        abVariantId: data.abVariantId,
      },
      opts: delay !== undefined ? { priority: data.priority, delay } : { priority: data.priority },
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

  // Record frequency cap BEFORE enqueueing (conservative: if enqueue later fails,
  // the cap slot is consumed rather than risking a double-send on the same contact).
  // recordFrequencySend is a best-effort Redis incr — errors are suppressed by the
  // helper so we don't block the send path.
  if (stream === 'broadcast') {
    await Promise.all(mtaJobs.map((j) => recordFrequencySend(data.orgId, j.data.contactId)));
  }

  for (const [queue, jobs] of byQueue) {
    await queue.addBulk(jobs.map((j) => ({ name: j.name, data: j.data, opts: j.opts })));
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
  newsletterTierName?: string | null,
): MergeTagContext {
  return {
    contact: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      ...contact.customFields,
      // Newsletter tier — allows DynamicBlock conditions like newsletter_tier_name == "Pro"
      ...(newsletterTierName ? { newsletter_tier_name: newsletterTierName } : {}),
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
  utmTracking?: {
    enabled?: boolean;
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  } | null,
): RenderedEmail {
  // Build UTM config if enabled
  const utm = utmTracking?.enabled
    ? {
        source: utmTracking.source,
        medium: utmTracking.medium,
        campaign: utmTracking.campaign,
        content: utmTracking.content,
        term: utmTracking.term,
      }
    : undefined;

  // Path 1: block JSON (production)
  if ('blocks' in content && Array.isArray((content as { blocks?: unknown }).blocks)) {
    const parsed = emailSchema.safeParse({
      preheader: preheader ?? '',
      ...content,
    } satisfies Partial<EmailSchema> | Record<string, unknown>);

    if (parsed.success) {
      const html = renderBlocks(parsed.data, { context: ctx, utm }).html;
      let text = renderPlainText(parsed.data, { context: ctx });
      // Org-wide custom footer (SendGrid Mail Settings) — HTML side is appended
      // by the renderer; mirror the plain-text side here.
      const footerText = ctx.system?.footerText?.trim();
      if (footerText) text += `\n\n${footerText}`;
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
    const text = textOverride ? parseMergeTags(textOverride, ctx) : deriveTextFromHtml(resolved);
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
 * Bulk newsletter-tier lookup — returns a map of contactId → tier name.
 * Used to populate newsletter_tier_name in MergeTagContext so DynamicBlocks
 * can gate content on subscriber tier (e.g. show premium content only to "Pro" subscribers).
 * Fail-open: missing contacts get undefined (no tier).
 */
async function fetchNewsletterTierNames(
  orgId: string,
  contactIds: string[],
): Promise<Map<string, string>> {
  if (contactIds.length === 0) return new Map();
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/newsletter-tiers/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
      },
      body: JSON.stringify({ orgId, contactIds }),
    });
    if (!res.ok) return new Map();
    const body = (await res.json()) as { data: Array<{ contactId: string; tierName: string }> };
    return new Map(body.data.map((r) => [r.contactId, r.tierName]));
  } catch {
    return new Map();
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
 * Sprint D.8 — fetch the org's ePrivacy strict-mode flag. Fail-safe to
 * false (= legitimate-interest mode) on API outages so a transient API
 * down doesn't accidentally apply tracking to opted-out recipients in
 * the wrong direction.
 */
async function fetchTrackingStrict(orgId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/org/tracking-strict?orgId=${orgId}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { data: { strict: boolean } };
    return body.data.strict === true;
  } catch {
    return false;
  }
}

/**
 * Returns true when platform admin has flipped settings.suspended via
 * /superadmin/orgs/:id/suspend. Fail-safe to false on transient errors
 * — we don't want a network blip to silently freeze legit sends. The
 * /superadmin/orgs/:id/send endpoint already refuses new sends, so the
 * only thing this catches is jobs already on the queue.
 */
async function fetchOrgSuspended(orgId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/org/suspended?orgId=${orgId}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { data: { suspended: boolean } };
    return body.data.suspended === true;
  } catch {
    return false;
  }
}

/**
 * Sprint D.8 — return the set of contactIds that have recorded explicit
 * opt-in on the 'tracking' channel for this org. Called only when
 * trackingEuStrict is on (one batch HTTP call per send batch). Fail-safe
 * to an empty set so a transient API outage does NOT accidentally
 * resume tracking for everyone — strict mode stays strict.
 */
async function fetchOptedInForTracking(orgId: string, contactIds: string[]): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/consent/opted-in-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, channel: 'tracking', contactIds }),
    });
    if (!res.ok) return new Set();
    const body = (await res.json()) as { data: { optedIn: string[] } };
    return new Set(body.data.optedIn);
  } catch {
    return new Set();
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
  orgId: string,
  contactIds: string[],
  cfg: TimewarpConfig,
): Promise<Map<string, string> | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/timewarp/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId,
        contactIds,
        baseDate: cfg.baseDate ?? new Date().toISOString(),
        localHour: cfg.localHour,
        fallbackTimezone: cfg.fallbackTimezone ?? 'Europe/Prague',
        skipHolidays: cfg.skipHolidays ?? false,
        holidayCountry: cfg.holidayCountry ?? 'cz',
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
  const worker = new Worker<BatchSenderJobData>(queueName, processBatchSender, {
    connection,
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    console.log(`[batch-sender] Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[batch-sender] Job ${job?.id} failed:`, err.message);
    captureJobException(err, {
      queue: 'batch-sender',
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      orgId: (job?.data as { orgId?: string } | undefined)?.orgId,
      campaignId: (job?.data as { campaignId?: string } | undefined)?.campaignId,
    });
  });

  return worker;
}
