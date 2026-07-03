/**
 * Campaign dispatch — the single choke point that turns a campaign into queued
 * batches. Used by both the manual `POST /campaigns/:id/send` route and the
 * scheduled-campaign cron (`dispatchScheduledCampaigns`), so scheduled/RSS
 * campaigns actually fire instead of sitting in `scheduled` forever.
 */

import { and, eq, lte } from 'drizzle-orm';
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
  const [row] = await db
    .select({
      domain: sendingDomains.domain,
      selector: sendingDomains.dkimSelector,
      privateKey: sendingDomains.dkimPrivateKey,
      verified: sendingDomains.isVerified,
    })
    .from(sendingDomains)
    .where(and(eq(sendingDomains.orgId, orgId), eq(sendingDomains.domain, domain)))
    .limit(1);
  if (!row || !row.verified || !row.privateKey) return null;
  return { dkimDomain: row.domain, dkimSelector: row.selector, dkimPrivateKey: row.privateKey };
}

/**
 * Transition a campaign to `sending` and enqueue the splitter job (audience →
 * batches). Forwards A/B config, UTM tracking, and DKIM so those features
 * activate. Throws on invalid state transition / readiness failure.
 */
export async function enqueueCampaignSend(orgId: string, campaignId: string) {
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

  // CAN-SPAM footer identity — auto-appended by the renderer when present.
  const [org] = await db
    .select({ companyName: organizations.companyName, postalAddress: organizations.postalAddress })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  await campaignSplitterQueue.add(`campaign-${campaignId}`, {
    companyName: org?.companyName ?? undefined,
    companyAddress: org?.postalAddress ?? undefined,
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
  await db
    .update(campaigns)
    .set({ status, updatedAt: new Date(), ...(status === 'sent' ? { sentAt: new Date() } : {}) })
    .where(eq(campaigns.id, campaignId));
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
