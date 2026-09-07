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

import { Worker, DelayedError, type Job } from 'bullmq';
import { captureJobException } from '../lib/telemetry.js';
import crypto from 'node:crypto';
import {
  renderEmail as renderBlocks,
  renderPlainText,
  parseMergeTags,
  type MergeTagContext,
} from '@forgemsg/editor/render';
import { readCampaignContent } from '@forgemsg/editor/schema';
import type { CampaignContentShape } from '@forgemsg/editor/schema';
import { assertOptOutPresent } from '../lib/optout-guard.js';
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
import {
  INTERNAL_SECRET,
  internalHeaders,
  internalGetHeaders,
  throwIfAuthFailure,
  rethrowIfAuthError,
  throwIfPermanentFailure,
  asFilterError,
} from '../lib/internal-api.js';

interface ContactRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customFields: Record<string, unknown>;
  /** Contact-level state. See the unsubscribed filter below. */
  status: string | null;
}

/** First delay after a pause, doubling up to DELAY_MAX_MS on each retry. */
const DELAY_BASE_MS = 30_000;
const DELAY_MAX_MS = 5 * 60_000;
/**
 * Hard ceiling on how long a batch will sit waiting for a pause to lift.
 *
 * Not a give-up mechanism — the batch never decides on its own that a campaign
 * is over. This exists so a job cannot be re-delayed forever if something goes
 * wrong with the reaper; the reaper is what closes an abandoned campaign, and
 * it acts at 72 h, well inside this.
 */
const DELAY_CEILING_MS = 7 * 24 * 60 * 60_000;

/** Statuses the batch must not send under, and what it should do about each. */
const BRAKE_STOP: ReadonlySet<string> = new Set(['cancelled', 'failed', 'sent']);

/**
 * Ask the API whether this campaign is still one we should be sending, and act
 * on the answer.
 *
 * Returns a result to hand straight back from the processor when the batch must
 * not run, or null to carry on. Three outcomes:
 *
 *   sending / queueing  → carry on. `queueing` is included because the splitter
 *                         may still be enqueueing while the first batches are
 *                         already being worked.
 *   paused              → put the job back on the queue and throw DelayedError.
 *                         It does NOT report completion: the campaign's counter
 *                         has to keep waiting for this batch, or resuming would
 *                         find the send already closed.
 *   cancelled/failed/sent → drop the batch and DO report completion, as fully
 *                         skipped. The campaign is over; a batch that stayed
 *                         silent here would leave the counter hanging forever.
 *
 * Measured, not assumed: moveToDelayed does not consume the retry budget —
 * 100 delays with `attempts: 2` left attemptsMade at 0 and the job still ran to
 * completion — and returning a value after moveToDelayed instead of throwing
 * makes the worker log "Missing lock for job … moveToFinished". Hence the throw.
 */
async function applyCampaignBrake(
  job: Job<BatchSenderJobData>,
  token: string | undefined,
  stream: MessageStream,
): Promise<{ sent: number; skipped: number; reason: string } | null> {
  const data = job.data;
  // Transactional and triggered mail is not part of a campaign the operator can
  // pause; only a broadcast has a campaign row whose status means anything here.
  if (stream !== 'broadcast') return null;

  const state = await fetchCampaignDispatchState(data.campaignId);
  // A campaign we cannot read is not a campaign we should refuse to send: this
  // check fails open, exactly like the org-suspended one above it, because a
  // transport blip must not silently stop every campaign in flight.
  if (!state) return null;

  if (BRAKE_STOP.has(state.status)) {
    job.log(
      `[brake] Campaign ${data.campaignId} is ${state.status} — dropping this batch of ` +
        `${data.contactIds.length} and reporting it complete.`,
    );
    await reportBatchCompletion(data, 0, data.contactIds.length);
    return { sent: 0, skipped: data.contactIds.length, reason: `campaign_${state.status}` };
  }

  if (state.status !== 'paused') return null;

  const waited = data.pauseWaitedMs ?? 0;
  if (waited >= DELAY_CEILING_MS) {
    // Seven days of pause. Something is wrong with the reaper, which should
    // have closed this campaign four days ago. Drop the batch so the counter
    // can finish, and say so at error level — this is not routine.
    console.error(
      `[batch-sender] campaign ${data.campaignId} has been paused for over ` +
        `${Math.round(DELAY_CEILING_MS / 86_400_000)} days and the reaper has not closed it. ` +
        `Dropping batch ${data.batchKey ?? data.batchIndex} so the dispatch can finish.`,
    );
    await reportBatchCompletion(data, 0, data.contactIds.length);
    return { sent: 0, skipped: data.contactIds.length, reason: 'pause_ceiling' };
  }

  const delay = Math.min(DELAY_BASE_MS * 2 ** (data.pauseDelays ?? 0), DELAY_MAX_MS);
  job.log(
    `[brake] Campaign ${data.campaignId} is paused — putting this batch back for ${delay / 1000}s ` +
      `(waited ${Math.round(waited / 1000)}s so far).`,
  );
  await job.updateData({
    ...data,
    pauseDelays: (data.pauseDelays ?? 0) + 1,
    pauseWaitedMs: waited + delay,
  });
  await job.moveToDelayed(Date.now() + delay, token);
  throw new DelayedError();
}

/**
 * Is it currently quiet hours for this org?
 *
 * Asked only for the triggered stream, and asked on its OWN endpoint rather
 * than through /internal/frequency/check-batch. That endpoint answers "is this
 * contact capped", which also applies the volume cap and the holdout — both
 * campaign concepts. Routing flow mail through it to reach the quiet-hours
 * answer would silently start capping flow mail too, which is a different
 * decision from not sending it at 3am.
 *
 * Fails OPEN, like every other filter in this file: a transport blip must not
 * hold a customer's password-reset-adjacent flow mail for ten hours. The cost
 * of failing open here is one message at a bad hour; the cost of failing
 * closed is a queue that stops on an API hiccup.
 */
async function fetchQuietHours(
  orgId: string,
): Promise<{ inQuietHours: boolean; nextSendAt: Date | null }> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/quiet-hours/check`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, channel: 'email' }),
    });
    if (!res.ok) return { inQuietHours: false, nextSendAt: null };
    const body = (await res.json()) as {
      data: { inQuietHours: boolean; nextSendAt: string | null };
    };
    return {
      inQuietHours: body.data.inQuietHours,
      nextSendAt: body.data.nextSendAt ? new Date(body.data.nextSendAt) : null,
    };
  } catch {
    return { inQuietHours: false, nextSendAt: null };
  }
}

/**
 * Hold a triggered batch until the org's quiet window ends.
 *
 * WHICH STREAMS. Broadcasts already learn this through the frequency check
 * (#135) and are left exactly as they were. Transactional mail is deliberately
 * exempt: a receipt or a password reset was asked for by the person receiving
 * it, and holding those until morning would be a worse product than the bug
 * this fixes. Only `triggered` changes — the stream abandoned-checkout
 * reminders (#132) and restock / price-drop alerts (#133) go out on, whose
 * timing is a `wait` node or a feed cron rather than an hour anyone chose.
 *
 * DELAY, NOT SKIP. A cart reminder is still worth sending at 9am; dropping it
 * loses the message and the sale. `moveToDelayed` + `throw DelayedError` is the
 * shape applyCampaignBrake already proves in this file — measured there not to
 * consume the retry budget, and to need the throw so BullMQ does not log
 * "Missing lock for job".
 *
 * The delay is until `nextSendAt`, computed once by the quiet-hours service,
 * not a backoff. The window is at most 24h wide, so one delay lands after it.
 */
const QUIET_MAX_DELAYS = 2;

async function applyQuietHours(
  job: Job<BatchSenderJobData>,
  token: string | undefined,
  stream: MessageStream,
): Promise<{ sent: number; skipped: number; reason: string } | null> {
  if (stream !== 'triggered') return null;

  const data = job.data;
  const quiet = await fetchQuietHours(data.orgId);
  if (!quiet.inQuietHours || !quiet.nextSendAt) return null;

  const delays = data.quietDelays ?? 0;
  if (delays >= QUIET_MAX_DELAYS) {
    // Unreachable under any valid configuration: a window is at most 24h and
    // nextSendAt is inside it, so the first delay always clears it. Getting
    // here means the delay machinery is misbehaving, and the honest answer is
    // to stop rather than to send — a guard that gives up and sends anyway at
    // 3am is not a guard, which is the whole lesson of the setting that used
    // to do nothing.
    console.error(
      `[batch-sender] batch ${data.batchKey ?? data.batchIndex} for org ${data.orgId} has been ` +
        `held ${delays} times for quiet hours and is still inside the window. Dropping it ` +
        `rather than sending outside the window the org configured.`,
    );
    return { sent: 0, skipped: data.contactIds.length, reason: 'quiet_hours_ceiling' };
  }

  const delayMs = Math.max(quiet.nextSendAt.getTime() - Date.now(), 60_000);
  job.log(
    `[quiet-hours] org ${data.orgId} is in its quiet window — holding this batch of ` +
      `${data.contactIds.length} until ${quiet.nextSendAt.toISOString()} ` +
      `(${Math.round(delayMs / 60_000)} min).`,
  );
  await job.updateData({ ...data, quietDelays: delays + 1 });
  await job.moveToDelayed(Date.now() + delayMs, token);
  throw new DelayedError();
}

/**
 * Exported for the integration suite, which drives a real batch through the
 * real filters rather than re-implementing them in a mock.
 */
export async function processBatchSender(job: Job<BatchSenderJobData>, token?: string) {
  const data = job.data;
  const stream: MessageStream = data.stream ?? 'broadcast';

  job.log(
    `Processing batch ${data.batchIndex} for campaign ${data.campaignId} stream=${stream} (${data.contactIds.length} contacts)`,
  );

  // The brake. Until now nothing in the send path read the campaign's status,
  // so Pause changed a column and stopped nothing and Cancel stopped nothing
  // either — the batches already on the queue went out regardless.
  const brake = await applyCampaignBrake(job, token, stream);
  if (brake) return brake;

  // Quiet hours for flow mail. The broadcast stream already learns this from
  // the frequency check; until now the triggered stream asked nobody, so an
  // abandoned-checkout reminder or a restock alert went out whenever its wait
  // node or its feed cron happened to fire.
  const quiet = await applyQuietHours(job, token, stream);
  if (quiet) return quiet;

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
  const consentBlockedSet = new Set<string>();
  let consentReasons: Record<string, string> = {};
  let consentConfigError = false;

  const contactIds = contacts.map((c) => c.id);
  const emails = contacts.map((c) => c.email);

  // Contacts who unsubscribed. `suppressions` was the only store the send path
  // consulted, and four of the fourteen unsubscribe paths — the contacts API,
  // Resend-compat, the SMS keyword handler, importers — wrote `contacts.status`
  // and nothing else. Those people kept receiving campaigns. resolveAudience
  // did not catch them either: it excludes 'archived' and 'non_subscribed' and
  // lets 'unsubscribed' through, on the assumption that suppressions would.
  //
  // The check belongs here rather than in /internal/contacts/batch because that
  // endpoint serves every stream, and a transactional message rests on contract
  // rather than marketing consent — the same reason the suppression check below
  // is skipped for it. 'bounced' and 'complained' are deliberately not included:
  // they get a suppression from mta-sender and fbl-processor at the moment they
  // happen, and treating them here would change behaviour this is not fixing.
  const unsubscribedSet = new Set<string>();
  if (stream !== 'transactional') {
    for (const c of contacts) {
      if (c.status === 'unsubscribed') unsubscribedSet.add(c.id);
    }
  }

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
  // GDPR consent — fourth pre-check, alongside the other three. Runs for every
  // stream except transactional: a transactional message (receipt, password
  // reset) rests on contract/legitimate interest, not marketing consent.
  if (stream !== 'transactional') {
    checks.push(
      fetchConsentBlockedBatch(data.orgId, contactIds, data.processingPurposeId).then((r) => {
        r.blocked.forEach((id) => consentBlockedSet.add(id));
        consentReasons = r.reasons;
        consentConfigError = r.configError;
      }),
    );
  }

  // Attach the rejection handlers NOW, not at the await below.
  //
  // These promises used to be incapable of rejecting — every filter swallowed
  // its own failure. Now they reject, and there are five more `await`s between
  // here and `await checksSettled`. A promise that rejects during those has no
  // handler attached yet, which Node reports as an unhandled rejection and, on
  // its default `--unhandled-rejections=throw`, uses to kill the process —
  // turning a cleanly failed job into a dead worker. Building the Promise.all
  // here attaches handlers to every member synchronously; awaiting it stays
  // where it was, so the checks still run in parallel with the fetches below.
  const checksSettled = Promise.all(checks);
  // …including on the aggregate itself. Attaching handlers to the members is
  // not enough: Promise.all returns a NEW promise, and that one has no handler
  // until the await below. This no-op catch marks it handled straight away;
  // `await checksSettled` still rejects with the same error, so nothing is
  // swallowed — measured, because the first attempt at this fix kept all four
  // unhandled rejections.
  void checksSettled.catch(() => {});

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
  // Kept alongside the address so the batch's volume can be charged to the row
  // it came from. recordIpSend is keyed by id, so a value naming no registered
  // IP updates nothing instead of creating a reputation row for it.
  let sendingIpId: string | null = null;
  try {
    const { pickIpForSend } = await import('@forgemsg/api/services/dedicated-ips');
    // Use the configuration set's IP pool when the campaign specifies one.
    const ip = await pickIpForSend(data.orgId, data.ipPoolId);
    sendingIp = ip?.ipAddress ?? '';
    sendingIpId = ip?.id ?? null;
  } catch (err) {
    rethrowIfAuthError(err);
    sendingIp = '';
    sendingIpId = null;
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

  await checksSettled;

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
    if (unsubscribedSet.has(contact.id)) {
      skipped++;
      continue;
    }
    if (suppressedSet.has(contact.email.toLowerCase())) {
      skipped++;
      continue;
    }
    if (cappedSet.has(contact.id) || heldOutSet.has(contact.id)) {
      skipped++;
      continue;
    }
    // 2. GDPR consent. Deliberately after the existing three so their
    //    behaviour and ordering are untouched.
    if (consentBlockedSet.has(contact.id)) {
      const reason = consentConfigError
        ? 'purpose_misconfigured'
        : (consentReasons[contact.id] ?? 'no_consent');
      job.log(
        `[consent] skip contact=${contact.id} campaign=${data.campaignId} purpose=${data.processingPurposeId ?? 'none'} reason=${reason}`,
      );
      console.warn(
        `[batch-sender][consent] blocked contact=${contact.id} org=${data.orgId} campaign=${data.campaignId} reason=${reason}`,
      );
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
        pollUrls: buildPollUrls(data.content, data, contact.id, trackingBaseUrl),
      },
      newsletterTierMap.get(contact.id),
    );
    let subject = parseMergeTags(data.subject, mergeCtx);

    // 4. Render HTML + plain-text alternative (block JSON path via
    //    @forgemsg/editor renderEmail + renderPlainText; legacy { html }
    //    path uses parseMergeTags + HTML→text fallback).
    const rendered = renderEmail(
      data.content,
      mergeCtx,
      data.preheader,
      data.utmTracking,
      stream,
      data.locale,
    );
    assertOptOutPresent(rendered, stream, unsubscribeUrl, data.campaignId);
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

  // Charge the IP for the batch, after the jobs are on the queue.
  //
  // The same reading as recordFrequencySend six lines above: the count is
  // taken once the messages are committed to being sent, not once each lands,
  // because the thing being rationed is connections the receiving ISP sees.
  // pickIpForSend orders by this column and gates a warming IP on it, so a
  // batch that does not report leaves both reads looking at a zero — which is
  // exactly the state this replaces. Best-effort: a batch that has done its
  // work must not be retried because the bookkeeping failed.
  if (sendingIpId && sent > 0) {
    try {
      const { recordIpSend } = await import('@forgemsg/api/services/dedicated-ips');
      await recordIpSend(sendingIpId, sent);
    } catch (err) {
      rethrowIfAuthError(err);
      console.error('[batch-sender] recordIpSend failed:', err);
    }
  }

  job.log(`Batch ${data.batchIndex}: sent=${sent}, skipped=${skipped}`);

  await reportBatchCompletion(data, sent, skipped);

  return { sent, skipped };
}

/**
 * Tell the API this batch is done, so the campaign's counter can come down.
 *
 * **This is the line the whole model rests on.** A batch that finishes without
 * reporting leaves the counter one above zero and the campaign in `sending`
 * forever — the exact failure this state model exists to remove. So it is
 * called on the clean path here and on the give-up path in the worker's
 * `failed` handler, and it never throws: a batch that has already done its work
 * must not be retried because the bookkeeping call failed, which would send the
 * whole batch a second time.
 *
 * The report is idempotent on the API side — the ledger row's completion flag
 * is the hinge — so a replay after stalled-job recovery cannot decrement twice.
 */
/** The brake's read. Null on any failure, so a blip cannot stop a live send. */
async function fetchCampaignDispatchState(
  campaignId: string,
): Promise<{ status: string; pausedReason: string | null } | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/campaigns/${campaignId}/dispatch-state`, {
      headers: internalHeaders(),
    });
    if (!res.ok) {
      console.error(`[batch-sender] dispatch-state ${campaignId} → HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { data?: { status: string; pausedReason: string | null } };
    return body.data ?? null;
  } catch (err) {
    console.error(`[batch-sender] dispatch-state ${campaignId} failed:`, err);
    return null;
  }
}

async function reportBatchCompletion(
  data: BatchSenderJobData,
  sent: number,
  skipped: number,
): Promise<void> {
  // Jobs enqueued before these fields existed cannot name their ledger row.
  // Nothing to report against; the reaper closes those campaigns instead.
  if (!data.dispatchId || !data.batchKey) return;
  const url = `${API_URL}/api/v1/internal/campaigns/${data.campaignId}/batch-complete`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({
        orgId: data.orgId,
        dispatchId: data.dispatchId,
        batchKey: data.batchKey,
        sent,
        skipped,
      }),
    });
    if (!res.ok) {
      console.error(
        `[batch-sender] batch-complete ${data.campaignId}/${data.batchKey} → HTTP ${res.status}`,
      );
    }
  } catch (err) {
    console.error(`[batch-sender] batch-complete ${data.campaignId}/${data.batchKey} failed:`, err);
  }
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
/**
 * One signed vote URL per poll answer, for this recipient.
 *
 * Built here rather than in the renderer because it carries the contact's
 * identity, exactly like the unsubscribe and view-in-browser tokens a few lines
 * above. The renderer is given the finished map and never mints anything; with
 * no map it draws the answers as plain text, which is what the archive page and
 * previews get.
 *
 * Reads the parsed schema, so a campaign with no poll costs one array scan.
 */
function buildPollUrls(
  content: Record<string, unknown>,
  data: BatchSenderJobData,
  contactId: string,
  trackingBaseUrl: string,
): Record<string, string[]> | undefined {
  const parsed = readCampaignContent(content);
  const blocks = (parsed.schema?.blocks ?? []) as unknown as {
    id: string;
    type: string;
    options?: unknown;
  }[];
  const polls = blocks.filter((b) => b.type === 'poll');
  if (polls.length === 0) return undefined;

  const out: Record<string, string[]> = {};
  for (const block of polls) {
    const options = Array.isArray(block.options) ? block.options : [];
    out[block.id] = options.map((_option, optionIndex) => {
      const token = createTrackingToken({
        type: 'poll',
        orgId: data.orgId,
        campaignId: data.campaignId,
        contactId,
        blockId: block.id,
        optionIndex,
        ts: Math.floor(Date.now() / 1000),
      });
      return `${trackingBaseUrl}/api/v1/poll/${token}`;
    });
  }
  return out;
}

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
  /**
   * Which branch of readCampaignContent produced this body. Carried out of the
   * renderer so assertOptOutPresent can say something true about the campaign
   * it is refusing, instead of calling everything raw HTML.
   */
  shape: CampaignContentShape;
}

/**
 * Render a campaign email for a specific contact, producing both an HTML
 * body and a plain-text alternative. The plain text is required by Gmail/
 * Yahoo 2024+ bulk-sender rules and reduces spam scoring across the board.
 *
 * Input shapes, resolved by readCampaignContent (@forgemsg/editor/schema),
 * which is also what the archive page uses so the two cannot diverge:
 *  1. a flat EmailSchema, or the { schema, html } the visual editor writes —
 *     renderBlocks() + renderPlainText(), the production path
 *  2. raw { html: string } [+ optional { text: string }] — the Resend-compat
 *     broadcasts API, the MCP server and the seed. Merge tags only; this path
 *     still misses the renderer's footer, sanitisation and UTM, and the
 *     opt-out is enforced for it by assertOptOutPresent instead
 *  3. anything else → JSON.stringify. No writer in the product produces this
 *     any more: services/rss used to store { items, sourceFeed, generatedFrom }
 *     and schedule it, which landed here and put the feed's JSON in the body;
 *     it now builds a block schema (api/services/rss/email-schema.ts) and takes
 *     path 1. Kept because campaigns.content is z.record(z.unknown()) — the
 *     column accepts anything, so the branch is the floor under a writer we do
 *     not have rather than a path we expect to take.
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
  stream: MessageStream = 'broadcast',
  locale?: 'en' | 'cs' | 'sk',
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

  // Path 1: block JSON.
  //
  // The shape test used to be `'blocks' in content`, written here and again in
  // browser-view.ts. That is FALSE for `{ schema, html }` — the shape the
  // visual editor saves — because the blocks are one level down, so the
  // product's primary authoring path fell through to Path 2 and shipped the
  // `html` the BROWSER had rendered at save time, against a hard-coded preview
  // contact. readCampaignContent is the one place that answers this now.
  const parsed = readCampaignContent(content, preheader);
  if (parsed.schema) {
    const html = renderBlocks(parsed.schema, { context: ctx, utm, stream, locale }).html;
    let text = renderPlainText(parsed.schema, { context: ctx, stream, locale });
    // Org-wide custom footer (SendGrid Mail Settings) — HTML side is appended
    // by the renderer; mirror the plain-text side here.
    const footerText = ctx.system?.footerText?.trim();
    if (footerText)
      text += `

${footerText}`;
    return { html, text, shape: parsed.shape };
  }
  if (parsed.error) {
    console.warn(
      `[batch-sender] ${parsed.shape} content did not parse as an EmailSchema, ` +
        `falling back to raw render:`,
      parsed.error,
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
    return { html: resolved, text, shape: parsed.shape };
  }

  // Path 3: fallback (should never happen in production)
  const serialised = JSON.stringify(content);
  return { html: serialised, text: serialised, shape: parsed.shape };
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
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, contactIds }),
    });
    throwIfPermanentFailure(res, '/internal/contacts/batch', orgId);
    const body = (await res.json()) as { data: ContactRow[] };
    return body.data;
  } catch (err) {
    // Returning [] here read as "this batch had no recipients" — a job that
    // logged an error and then reported success. A batch whose recipients
    // could not be loaded has not been sent, and must not look as if it was.
    throw asFilterError(err, '/internal/contacts/batch', orgId);
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
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, emails }),
    });
    throwIfPermanentFailure(res, '/internal/suppressions/check-batch', orgId);
    const body = (await res.json()) as { data: { suppressed: string[] } };
    return body.data.suppressed;
  } catch (err) {
    throw asFilterError(err, '/internal/suppressions/check-batch', orgId);
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
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ orgId, contactIds }),
    });
    throwIfAuthFailure(res, '/internal/newsletter-tiers/batch');
    if (!res.ok) return new Map();
    const body = (await res.json()) as { data: Array<{ contactId: string; tierName: string }> };
    return new Map(body.data.map((r) => [r.contactId, r.tierName]));
  } catch (err) {
    rethrowIfAuthError(err);
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
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, contactIds, channel: 'email' }),
    });
    throwIfPermanentFailure(res, '/internal/frequency/check-batch', orgId);
    const body = (await res.json()) as { data: { capped: string[] } };
    return body.data.capped;
  } catch (err) {
    throw asFilterError(err, '/internal/frequency/check-batch', orgId);
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
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, contactIds }),
    });
    throwIfPermanentFailure(res, '/internal/holdout/check-batch', orgId);
    const body = (await res.json()) as { data: { heldOut: string[] } };
    return body.data.heldOut;
  } catch (err) {
    throw asFilterError(err, '/internal/holdout/check-batch', orgId);
  }
}

/**
 * Bulk GDPR consent check — returns the contacts that must not receive this
 * campaign under its processing purpose, plus a per-contact reason.
 *
 * Fail-open/fail-closed split, and it matters:
 *
 *   - TRANSPORT FAULT (fetch throws, non-2xx) → fail OPEN, returning an empty
 *     block list. Same posture as suppression / frequency / holdout: a flaky
 *     internal API must not silently halt a send.
 *
 *   - CONFIG ERROR (2xx with configError: true) → fail CLOSED, blocking every
 *     contact in the batch. The API reached a definite verdict: the campaign
 *     points at a purpose that no longer exists. Sending anyway would be
 *     sending without a lawful basis, which is worse than not sending.
 *
 * The two are distinguishable precisely because the config error arrives as a
 * successful HTTP response rather than an error status.
 */
async function fetchConsentBlockedBatch(
  orgId: string,
  contactIds: string[],
  processingPurposeId: string | null | undefined,
): Promise<{ blocked: string[]; reasons: Record<string, string>; configError: boolean }> {
  const empty = { blocked: [], reasons: {}, configError: false };
  if (contactIds.length === 0) return empty;
  try {
    const res = await fetch(`${API_URL}/api/v1/internal/consent/check-batch`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, contactIds, processingPurposeId: processingPurposeId ?? null }),
    });
    throwIfPermanentFailure(res, '/internal/consent/check-batch', orgId);
    const body = (await res.json()) as {
      data: {
        blocked: string[];
        reasons?: Record<string, string>;
        configError?: boolean;
        message?: string;
      };
    };
    return {
      blocked: body.data.blocked ?? [],
      reasons: body.data.reasons ?? {},
      configError: body.data.configError === true,
    };
  } catch (err) {
    throw asFilterError(err, '/internal/consent/check-batch', orgId);
  }
}

async function recordFrequencySend(orgId: string, contactId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/internal/frequency/record`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, contactId, channel: 'email' }),
    });
  } catch (err) {
    rethrowIfAuthError(err);
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
    const res = await fetch(`${API_URL}/api/v1/internal/org/tracking-strict?orgId=${orgId}`, {
      headers: internalGetHeaders(),
    });
    throwIfPermanentFailure(res, '/internal/org/tracking-strict', orgId);
    const body = (await res.json()) as { data: { strict: boolean } };
    return body.data.strict === true;
  } catch (err) {
    throw asFilterError(err, '/internal/org/tracking-strict', orgId);
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
    const res = await fetch(`${API_URL}/api/v1/internal/org/suspended?orgId=${orgId}`, {
      headers: internalGetHeaders(),
    });
    throwIfPermanentFailure(res, '/internal/org/suspended', orgId);
    const body = (await res.json()) as { data: { suspended: boolean } };
    return body.data.suspended === true;
  } catch (err) {
    throw asFilterError(err, '/internal/org/suspended', orgId);
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
      headers: internalHeaders(),
      body: JSON.stringify({ orgId, channel: 'tracking', contactIds }),
    });
    throwIfAuthFailure(res, '/internal/consent/opted-in-batch');
    if (!res.ok) return new Set();
    const body = (await res.json()) as { data: { optedIn: string[] } };
    return new Set(body.data.optedIn);
  } catch (err) {
    rethrowIfAuthError(err);
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
    const res = await fetch(`${API_URL}/api/v1/internal/tracking-domain?orgId=${orgId}`, {
      headers: internalGetHeaders(),
    });
    throwIfAuthFailure(res, '/internal/tracking-domain');
    if (!res.ok) return fallback;
    const body = (await res.json()) as { data: { baseUrl: string; branded: boolean } };
    return body.data.baseUrl ?? fallback;
  } catch (err) {
    rethrowIfAuthError(err);
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
      headers: internalHeaders(),
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
    // Protective, with its own reason. "Postpone" without a new scheduling
    // layer means exactly this: throw, and let BullMQ re-run the job later.
    // Falling back to null sends immediately, which for a timewarp campaign
    // can mean 3 a.m. in the recipient's timezone — a complaint and
    // deliverability risk, not a cosmetic downgrade.
    throwIfPermanentFailure(res, '/internal/timewarp/schedule', orgId);
    const body = (await res.json()) as { data: Record<string, string> };
    return new Map(Object.entries(body.data));
  } catch (err) {
    throw asFilterError(err, '/internal/timewarp/schedule', orgId);
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

    // Out of retries: this batch is over, and the campaign has to be able to
    // finish without it. A give-up that does not report is indistinguishable
    // from a batch still in flight, and the campaign would wait on it forever.
    // Only on the LAST attempt — reporting on an intermediate failure would
    // close the campaign while the retry is still to come.
    const attemptsAllowed = job?.opts?.attempts ?? 1;
    if (job && (job.attemptsMade ?? 0) >= attemptsAllowed) {
      void reportBatchCompletion(job.data, 0, 0);
    }
  });

  return worker;
}
