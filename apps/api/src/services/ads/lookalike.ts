/**
 * Lookalike audience generation (#303).
 * Takes an existing Custom Audience (from audience-sync) and requests
 * a lookalike from the platform using native APIs.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adAccounts, adAudienceSyncs } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import type { AdPlatform } from '../../db/schema/ad-accounts.js';

export interface LookalikeResult {
  platform: AdPlatform;
  lookalikeName: string;
  platformAudienceId: string;
  countryCode: string;
  ratio: number;  // 0.01–0.20 (Facebook), ignored for others
}

// ── Facebook Lookalike ────────────────────────────────────────────────────────

async function createFacebookLookalike(
  account: typeof adAccounts.$inferSelect,
  sourceAudienceId: string,
  countryCode: string,
  ratio: number,
  name: string,
): Promise<LookalikeResult> {
  const res = await fetch(`https://graph.facebook.com/v19.0/act_${account.platformAccountId}/customaudiences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      subtype: 'LOOKALIKE',
      origin_audience_id: sourceAudienceId,
      lookalike_spec: {
        type: 'similarity',
        ratio,
        country: countryCode,
      },
      access_token: account.accessToken,
    }),
  });
  const json = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? 'Facebook lookalike creation failed');
  return { platform: 'facebook_ads', lookalikeName: name, platformAudienceId: json.id, countryCode, ratio };
}

// ── LinkedIn Lookalike ────────────────────────────────────────────────────────

async function createLinkedInLookalike(
  account: typeof adAccounts.$inferSelect,
  sourceSegmentId: string,
  name: string,
): Promise<LookalikeResult> {
  const res = await fetch('https://api.linkedin.com/v2/dmpSegments', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: `urn:li:sponsoredAccount:${account.platformAccountId}`,
      name,
      type: 'LOOKALIKE',
      lookalikeSeedSegmentUrn: `urn:li:dmpSegment:${sourceSegmentId}`,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn lookalike failed: ${res.status}`);
  const json = await res.json() as { id?: string };
  return { platform: 'linkedin_ads', lookalikeName: name, platformAudienceId: String(json.id ?? ''), countryCode: 'US', ratio: 0.05 };
}

// ── Google Similar Audiences (note: GAS are auto-generated, we just flag) ────

async function createGoogleLookalike(
  account: typeof adAccounts.$inferSelect,
  sourceListResourceName: string,
  name: string,
): Promise<LookalikeResult> {
  // Google auto-creates Similar Audiences from existing user lists.
  // We create a combined_audience user_list that references the source.
  const customerId = account.platformAccountId;
  const body = {
    operations: [{
      create: {
        name,
        description: `Lookalike for ${sourceListResourceName}`,
        membershipLifeSpan: 30,
        similarUserList: { seedUserList: sourceListResourceName },
      },
    }],
  };
  const res = await fetch(
    `https://googleads.googleapis.com/v16/customers/${customerId}/userLists:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Google lookalike failed: ${res.status}`);
  const json = await res.json() as { results?: Array<{ resourceName: string }> };
  return { platform: 'google_ads', lookalikeName: name, platformAudienceId: json.results?.[0]?.resourceName ?? name, countryCode: 'US', ratio: 0.05 };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createLookalikeAudience(orgId: string, input: {
  adAccountId: string;
  sourceSyncId: string;   // id of the adAudienceSyncs record to seed from
  lookalikeName?: string;
  countryCode?: string;
  ratio?: number;
}) {
  const [adAccount] = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.orgId, orgId), eq(adAccounts.id, input.adAccountId)));
  if (!adAccount) throw AppError.notFound('Ad account not found');

  const [sourceSync] = await db
    .select()
    .from(adAudienceSyncs)
    .where(and(eq(adAudienceSyncs.orgId, orgId), eq(adAudienceSyncs.id, input.sourceSyncId)));
  if (!sourceSync || !sourceSync.platformAudienceId) {
    throw AppError.badRequest('Source audience sync not found or not yet completed');
  }

  const lookalikeName = input.lookalikeName ?? `Lookalike: ${sourceSync.audienceName}`;
  const countryCode = input.countryCode ?? 'US';
  const ratio = input.ratio ?? 0.02;
  const platform = adAccount.platform as AdPlatform;

  let result: LookalikeResult;
  switch (platform) {
    case 'facebook_ads':
      result = await createFacebookLookalike(adAccount, sourceSync.platformAudienceId, countryCode, ratio, lookalikeName);
      break;
    case 'linkedin_ads':
      result = await createLinkedInLookalike(adAccount, sourceSync.platformAudienceId, lookalikeName);
      break;
    case 'google_ads':
      result = await createGoogleLookalike(adAccount, sourceSync.platformAudienceId, lookalikeName);
      break;
    default:
      throw AppError.badRequest(`Lookalike audiences not supported for ${platform}`);
  }

  // Record as a new audience sync entry so we can track it
  const [record] = await db
    .insert(adAudienceSyncs)
    .values({
      orgId,
      adAccountId: adAccount.id,
      audienceName: `[Lookalike] ${lookalikeName}`,
      platformAudienceId: result.platformAudienceId,
      status: 'completed',
      lastSyncAt: new Date(),
    })
    .returning();

  return { ...result, syncId: record!.id };
}
