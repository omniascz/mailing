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
import { sendCampaign } from './index.js';

/**
 * Resolve DKIM signing material for a campaign's From address. Without this the
 * splitter forwards no key and the MTA sends unsigned mail (→ spam). Looks up
 * the verified sending domain matching the From address's domain.
 */
export async function resolveDkimForSender(
  orgId: string,
  fromEmail: string,
): Promise<{ dkimDomain: string; dkimSelector: string; dkimPrivateKey: string } | null> {
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  // The signing key is the domain's single ACTIVE dkim_keys row — never a
  // pending key (not yet in DNS), and never null merely because a rotation is
  // underway (the old key stays active until the new one is verified). This is
  // the fix for the rotation window: mail is always signed with a key a receiver
  // can look up.
  const { resolveActiveKey } = await import('../domains/dkim-rotation.js');
  const key = await resolveActiveKey(orgId, domain);
  if (!key) return null;
  return { dkimDomain: domain, dkimSelector: key.selector, dkimPrivateKey: key.privateKey };
}

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

  // Non-email campaigns (sms/whatsapp/push) fan out over their own channel
  // queues instead of the email splitter → MTA pipeline.
  if (campaign.type && campaign.type !== 'email') {
    const { dispatchChannelCampaign } = await import('./channel-dispatch.js');
    try {
      await dispatchChannelCampaign(orgId, campaign);
    } catch (err) {
      // Roll the campaign back to draft so the operator can fix (e.g. missing
      // content) and re-send, instead of leaving it stuck in 'sending'.
      await setCampaignStatusInternal(campaignId, 'paused').catch(() => {});
      throw err;
    }
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
    .select({ companyName: organizations.companyName, postalAddress: organizations.postalAddress })
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
    ipPoolId: cfg.ipPoolId ?? undefined,
    tlsPolicy: cfg.tlsPolicy,
    // GDPR purpose the batch-sender's consent pre-check enforces against.
    processingPurposeId: campaign.processingPurposeId ?? null,
    ...(dkim ?? {}),
    priority: PRIORITY.CAMPAIGN,
  });

  return campaign;
}

/**
 * Direct status setter used by the splitter worker (which only knows the
 * campaignId). Bypasses the org-scoped transition validation because the
 * worker is trusted and drives the sending→sent lifecycle. Sets sentAt when
 * marking sent.
 */
export async function setCampaignStatusInternal(
  campaignId: string,
  status: 'sending' | 'sent' | 'paused' | 'cancelled',
): Promise<void> {
  const [row] = await db
    .update(campaigns)
    .set({ status, updatedAt: new Date(), ...(status === 'sent' ? { sentAt: new Date() } : {}) })
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
): Promise<{ dispatched: number; errors: number }> {
  const due = await db
    .select({ id: campaigns.id, orgId: campaigns.orgId })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'scheduled'), lte(campaigns.scheduledAt, now)))
    .limit(500);

  let dispatched = 0;
  let errors = 0;
  for (const c of due) {
    try {
      await enqueueCampaignSend(c.orgId, c.id);
      dispatched++;
    } catch (err) {
      errors++;
      console.error(`[dispatch-scheduled] campaign ${c.id} failed:`, err);
    }
  }
  return { dispatched, errors };
}
