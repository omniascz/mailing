/**
 * Campaign dispatch — the single choke point that turns a campaign into queued
 * batches. Used by both the manual `POST /campaigns/:id/send` route and the
 * scheduled-campaign cron (`dispatchScheduledCampaigns`), so scheduled/RSS
 * campaigns actually fire instead of sitting in `scheduled` forever.
 */

import { and, eq, lte } from 'drizzle-orm';
import { emitWebhookEvent } from '../webhooks/emit.js';
import { db } from '../../db/client.js';
import { campaigns, sendingDomains, organizations } from '../../db/schema/index.js';
import { campaignSplitterQueue, PRIORITY } from '../../lib/queues.js';
import { sendCampaign, type CampaignPausedReason } from './index.js';

/**
 * Re-exported so this module's existing importers keep working. The resolver
 * itself moved to services/domains/dkim-rotation.ts, next to the key lifecycle
 * that produces what it reads, because the transactional send path needs the
 * same answer and cannot import this module without a cycle.
 *
 * The signing key is the domain's single ACTIVE dkim_keys row — never a pending
 * key (not yet in DNS), and never null merely because a rotation is underway
 * (the old key stays active until the new one is verified), so mail is always
 * signed with a key a receiver can look up.
 */
import { resolveDkimForSender } from '../domains/dkim-rotation.js';
export { resolveDkimForSender };

/**
 * Resolve the From domain's open/click tracking defaults. Returns enabled for
 * both when no verified sending domain matches (safe default).
 */
export async function resolveTrackingForSender(
  orgId: string,
  fromEmail: string,
): Promise<{ openTracking: boolean; clickTracking: boolean }> {
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (!domain) return { openTracking: true, clickTracking: true };
  const [row] = await db
    .select({ open: sendingDomains.openTracking, click: sendingDomains.clickTracking })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.orgId, orgId), eq(sendingDomains.domain, domain)))
    .limit(1);
  return { openTracking: row?.open ?? true, clickTracking: row?.click ?? true };
}

/**
 * Transition a campaign to `sending` and enqueue the splitter job (audience →
 * batches). Forwards A/B config, UTM tracking, and DKIM so those features
 * activate. Throws on invalid state transition / readiness failure.
 */
/**
 * The time-warp config the splitter should carry, or undefined.
 *
 * Two things happen here that the stored value does not say.
 *
 * `baseDate` is the anchor day the worker measures each recipient's local hour
 * against, and it defaults — inside the worker — to "whenever the batch
 * happened to run". For a scheduled campaign that is wrong in a way nobody
 * would notice until a send straddled midnight: the cron picks the campaign up
 * within a minute of `scheduledAt`, but the splitter and the batches behind it
 * run later, and a batch that starts at 23:58 would anchor the next day for
 * everyone in it. Pinning it to the campaign's own scheduled time makes every
 * batch of one send agree on which day it is, whoever runs first.
 *
 * `fallbackTimezone` is filled in here rather than left to the worker's
 * default so the value that decides where an unknown contact is sent is
 * visible in the campaign's own dispatch, not two packages away. Europe/Prague
 * because that is the market this launches into; an org that sends elsewhere
 * sets it on the campaign.
 *
 * A contact with no known timezone is sent at `localHour` in that fallback —
 * never dropped. Dropping would mean a recipient silently receives nothing
 * because we could not guess their country, which is a worse failure than an
 * email arriving at 9 a.m. Prague instead of 9 a.m. wherever they are.
 */
function timewarpForDispatch(campaign: {
  timewarp?: {
    enabled: boolean;
    localHour: number;
    fallbackTimezone?: string;
    skipHolidays?: boolean;
    holidayCountry?: 'cz' | 'sk';
  } | null;
  scheduledAt?: Date | null;
}) {
  const tw = campaign.timewarp;
  if (!tw?.enabled) return undefined;
  return {
    enabled: true,
    localHour: tw.localHour,
    baseDate: (campaign.scheduledAt ?? new Date()).toISOString(),
    fallbackTimezone: tw.fallbackTimezone ?? 'Europe/Prague',
    skipHolidays: tw.skipHolidays ?? false,
    holidayCountry: tw.holidayCountry ?? 'cz',
  };
}

export async function enqueueCampaignSend(orgId: string, campaignId: string) {
  // Sandbox gate: a non-production org cannot fire bulk campaigns (the audience
  // can't be verified per-recipient at dispatch). Mirrors the transactional
  // verified-recipient gate. Checked before any state transition.
  const { assertBulkSendAllowed } = await import('../identities/index.js');
  await assertBulkSendAllowed(orgId);

  // From-domain ownership, checked at the click on Send rather than deep inside
  // the batch-sender where no operator is watching. Only email campaigns carry
  // an email From; sms/whatsapp/push fan out over their own channels. Read just
  // the two fields, before sendCampaign() transitions any state.
  const [row] = await db
    .select({ fromEmail: campaigns.fromEmail, type: campaigns.type })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (row && (!row.type || row.type === 'email') && row.fromEmail) {
    const { assertFromDomainOwned } = await import('../sending/from-domain.js');
    await assertFromDomainOwned(orgId, row.fromEmail);
  }

  const campaign = await sendCampaign(orgId, campaignId);

  // Everything from here to a SUCCESSFUL enqueue runs with the campaign already
  // flipped to 'sending', so anything that throws in between has to put it back.
  // A campaign left in 'sending' with nothing on the queue is stuck for good:
  // the splitter never ran, so nothing ever drives it sending→sent, and
  // dispatchScheduledCampaigns only ever selects status='scheduled', so the
  // cron will not pick it up again either. It needs a human and a SQL console.
  //
  // The non-email branch already rolled back. The email branch — which has
  // strictly more that can throw between the flip and the enqueue: a DKIM key
  // that cannot be read, a configuration set that is unknown or has sending
  // paused, four separate database reads, and the Redis write itself — did not.
  // So this is that same rollback widened to cover both, not a new mechanism:
  // same target state, same best-effort write, same rethrow. No new status and
  // no change to the transition table.
  try {
    // Non-email campaigns (sms/whatsapp/push) fan out over their own channel
    // queues instead of the email splitter → MTA pipeline.
    if (campaign.type && campaign.type !== 'email') {
      const { dispatchChannelCampaign } = await import('./channel-dispatch.js');
      await dispatchChannelCampaign(orgId, campaign);
      return campaign;
    }

    const dkim = campaign.fromEmail ? await resolveDkimForSender(orgId, campaign.fromEmail) : null;

    // Per-domain open/click tracking defaults — honored by batch-sender (gates
    // pixel/link injection). Defaults to enabled when no domain row matches.
    const tracking = campaign.fromEmail
      ? await resolveTrackingForSender(orgId, campaign.fromEmail)
      : { openTracking: true, clickTracking: true };

    // Apply the configuration set (throws 403 if its sending is paused) → thread
    // its IP pool + TLS policy to the batch/MTA path so per-config-set enforcement
    // works for campaigns too (not just transactional).
    const { applyConfigurationSet } = await import('../configuration-sets/index.js');
    const cfg = await applyConfigurationSet(orgId, campaign.configurationSet ?? undefined);

    // CAN-SPAM footer identity — auto-appended by the renderer when present.
    const [org] = await db
      .select({
        companyName: organizations.companyName,
        postalAddress: organizations.postalAddress,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // Org-wide custom footer (SendGrid Mail Settings) — appended to every email.
    const { getMailSettings } = await import('../settings/mail-settings.js');
    const mailSettings = await getMailSettings(orgId);
    const footer = mailSettings.footer.enabled ? mailSettings.footer : null;

    await campaignSplitterQueue.add(`campaign-${campaignId}`, {
      companyName: org?.companyName ?? undefined,
      // The last link: the column has existed since the campaigns table was
      // written and nothing ever read it, so every send rendered as English.
      locale: (campaign.locale ?? 'en') as 'en' | 'cs' | 'sk',
      companyAddress: org?.postalAddress ?? undefined,
      footerHtml: footer?.html || undefined,
      footerText: footer?.text || undefined,
      openTracking: tracking.openTracking,
      clickTracking: tracking.clickTracking,
      campaignId,
      orgId,
      listId: campaign.listId,
      segmentId: campaign.segmentId,
      excludeSegmentId: campaign.excludeSegmentId,
      content: campaign.content,
      subject: campaign.subject,
      preheader: campaign.preheader,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      replyTo: campaign.replyTo,
      abConfig: campaign.abConfig ?? undefined,
      utmTracking: campaign.utmTracking ?? undefined,
      timewarp: timewarpForDispatch(campaign),
      ipPoolId: cfg.ipPoolId ?? undefined,
      tlsPolicy: cfg.tlsPolicy,
      // GDPR purpose the batch-sender's consent pre-check enforces against.
      processingPurposeId: campaign.processingPurposeId ?? null,
      ...(dkim ?? {}),
      priority: PRIORITY.CAMPAIGN,
    });
  } catch (err) {
    // Roll the campaign back so the operator can fix what failed (missing
    // content, a paused configuration set, an unreadable signing key) and press
    // Send again, instead of leaving it stuck in 'sending'. Best effort: if the
    // rollback write itself fails there is nothing better to do than surface the
    // original error, which is the one that says what actually went wrong.
    // 'send_failed' is what makes this recoverable: nothing reached the queue,
    // so resumeCampaign is allowed to enqueue rather than only flip the status
    // back. Without it the pause is indistinguishable from an operator's.
    await setCampaignStatusInternal(campaignId, 'paused', 'send_failed').catch(() => {});
    throw err;
  }

  return campaign;
}

/**
 * Direct status setter used by the splitter worker (which only knows the
 * campaignId). Bypasses the org-scoped transition validation because the
 * worker is trusted and drives the sending→sent lifecycle. Sets sentAt when
 * marking sent.
 *
 * `pausedReason` is only meaningful alongside 'paused'; every other status
 * clears it. Callers that pause without a reason (ab-winner parking a campaign
 * for review) leave it NULL, which readers treat as "do not enqueue".
 */
export async function setCampaignStatusInternal(
  campaignId: string,
  status: 'sending' | 'sent' | 'paused' | 'cancelled' | 'failed',
  pausedReason: CampaignPausedReason | null = null,
): Promise<void> {
  const [row] = await db
    .update(campaigns)
    .set({
      status,
      updatedAt: new Date(),
      // Cleared on anything that is not a pause — including 'sending', so a
      // stale reason can never survive into the next pause and be read as its
      // cause.
      pausedReason: status === 'paused' ? pausedReason : null,
      // A campaign that has ended has nothing outstanding. Left set, the
      // counter reads as an unfinished dispatch — the same invariant
      // markCampaignSent and markCampaignFailed already keep.
      ...(status === 'sent' || status === 'failed' || status === 'cancelled'
        ? { pendingBatches: null, awaitingAbWinner: false }
        : {}),
      ...(status === 'sent' ? { sentAt: new Date() } : {}),
    })
    .where(eq(campaigns.id, campaignId))
    .returning();

  // campaign.sent fires here rather than when the send is enqueued, because
  // this is the transition the splitter drives after the LAST batch finishes
  // (campaign-splitter.ts → PATCH /internal/campaigns/:id/status). Emitting at
  // enqueue time would mean "sent" arrived while the campaign still had hours
  // of delivery ahead of it.
  //
  // Known caveat: channel-dispatch.ts sets 'sent' for SMS/WhatsApp/push right
  // after the messages are queued, so on those channels this event is early.
  // That is a pre-existing lifecycle bug in channel-dispatch, not something
  // this emitter can fix from here.
  if (status === 'sent' && row) {
    emitWebhookEvent(row.orgId, 'campaign.sent', {
      campaignId: row.id,
      name: row.name ?? null,
      subject: row.subject ?? null,
      type: row.type ?? null,
      recipientCount: row.estimatedRecipients ?? null,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    });
  }
}

/**
 * Find campaigns whose scheduled time has arrived and dispatch them. Called
 * every minute by the campaign-dispatch cron. Each failure is isolated so one
 * bad campaign doesn't block the rest.
 */
export async function dispatchScheduledCampaigns(
  now: Date = new Date(),
): Promise<{ dispatched: number; errors: number; withdrawn: number }> {
  const due = await db
    .select({ id: campaigns.id, orgId: campaigns.orgId })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'scheduled'), lte(campaigns.scheduledAt, now)))
    .limit(500);

  let dispatched = 0;
  let errors = 0;
  let withdrawn = 0;
  for (const c of due) {
    try {
      // Read the status again, immediately before sending.
      //
      // The select above can be seconds old by the time this iteration runs —
      // it takes up to 500 campaigns and each one does several round trips. An
      // operator who takes a due campaign off the schedule inside that window
      // gets it back as a draft, and `draft → queueing` is a legal transition
      // (it is the manual Send path), so without this check sendCampaign would
      // send the campaign they just stopped. Cancel does not have the problem:
      // `cancelled` is terminal and the transition is refused.
      //
      // This narrows the window to one statement rather than closing it. Closing
      // it needs the select and the claim to be one atomic UPDATE ... RETURNING,
      // which changes how every scheduled send is claimed and is not this
      // change's to make.
      const [still] = await db
        .select({ status: campaigns.status })
        .from(campaigns)
        .where(eq(campaigns.id, c.id))
        .limit(1);
      if (still?.status !== 'scheduled') {
        withdrawn++;
        continue;
      }

      await enqueueCampaignSend(c.orgId, c.id);
      dispatched++;
    } catch (err) {
      errors++;
      console.error(`[dispatch-scheduled] campaign ${c.id} failed:`, err);
    }
  }
  return { dispatched, errors, withdrawn };
}
