/**
 * Send-time guard: a campaign belonging to an org that enforces GDPR
 * processing purposes must name one.
 *
 * This exists so the failure surfaces at POST /campaigns/:id/send, where an
 * operator sees it, instead of inside batch-sender where it would either be
 * silently skipped or would block a batch nobody is watching.
 *
 * Orgs with no active purpose are unaffected — the whole purpose feature is
 * opt-in and stays inert until the org configures one.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { processingPurposes, campaigns } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function assertCampaignPurpose(orgId: string, campaignId: string): Promise<void> {
  const [campaign] = await db
    .select({ processingPurposeId: campaigns.processingPurposeId })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.id, campaignId)))
    .limit(1);

  // Missing campaign is not this check's problem — enqueueCampaignSend reports it.
  if (!campaign || campaign.processingPurposeId) return;

  const [anyPurpose] = await db
    .select({ id: processingPurposes.id })
    .from(processingPurposes)
    .where(and(eq(processingPurposes.orgId, orgId), eq(processingPurposes.archived, false)))
    .limit(1);

  if (!anyPurpose) return; // org does not use purposes — nothing to enforce

  throw AppError.badRequest(
    'This campaign has no GDPR processing purpose. Your organisation has active processing purposes, so every campaign must declare which one it sends under. Set processingPurposeId on the campaign and send again.',
    { reason: 'CAMPAIGN_PURPOSE_REQUIRED' },
  );
}
