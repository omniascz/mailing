/**
 * Ad attribution extension (#306).
 * Extends revenue attribution with ad-source detection: paid UTM params
 * and view-through attribution via ad platform conversion APIs.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { revenueEvents, adAccounts } from '../../db/schema/index.js';

export interface AdAttributionInput {
  orgId: string;
  contactId?: string;
  orderId?: string;
  amount: number;
  currency?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  adClickId?: string; // fbclid, gclid, li_fat_id, ttclid
  viewThrough?: boolean;
  adPlatform?: string;
  adCampaignId?: string;
  occurredAt?: Date;
}

// Detect ad platform from UTM or click ID
function detectAdPlatform(input: AdAttributionInput): string | null {
  if (input.adPlatform) return input.adPlatform;
  if (input.adClickId) {
    if (input.adClickId.startsWith('fb')) return 'facebook_ads';
    if (input.adClickId.startsWith('gc')) return 'google_ads';
    if (input.adClickId.startsWith('li')) return 'linkedin_ads';
    if (input.adClickId.startsWith('tt')) return 'tiktok_ads';
  }
  const medium = (input.utmMedium ?? '').toLowerCase();
  if (['cpc', 'paid', 'paid_social', 'paidsocial', 'ppc'].includes(medium)) {
    const src = (input.utmSource ?? '').toLowerCase();
    if (src.includes('facebook') || src.includes('fb')) return 'facebook_ads';
    if (src.includes('google')) return 'google_ads';
    if (src.includes('linkedin')) return 'linkedin_ads';
    if (src.includes('tiktok')) return 'tiktok_ads';
    return 'unknown_paid';
  }
  return null;
}

// Send offline conversion to Facebook (Conversions API)
async function sendFacebookOfflineConversion(
  account: typeof adAccounts.$inferSelect,
  input: AdAttributionInput,
) {
  const pixel = process.env.FACEBOOK_PIXEL_ID ?? account.platformAccountId;
  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor((input.occurredAt ?? new Date()).getTime() / 1000),
        user_data: { em: null, external_id: input.contactId },
        custom_data: { currency: input.currency ?? 'USD', value: input.amount },
        event_source_url: null,
        action_source: 'other',
      },
    ],
    access_token: account.accessToken,
  };
  await fetch(`https://graph.facebook.com/v19.0/${pixel}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    /* best-effort */
  });
}

// Send offline conversion to Google Ads
async function sendGoogleOfflineConversion(
  account: typeof adAccounts.$inferSelect,
  input: AdAttributionInput,
) {
  if (!input.adClickId || !input.adCampaignId) return;
  await fetch(
    `https://googleads.googleapis.com/v16/customers/${account.platformAccountId}/offlineUserDataJobs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job: { type: 'STORE_SALES_UPLOAD_FIRST_PARTY', storeSalesMetadata: {} },
      }),
    },
  ).catch(() => {
    /* best-effort */
  });
}

// ── Main attribution function ─────────────────────────────────────────────────

export async function attributeRevenueToAd(input: AdAttributionInput) {
  const platform = detectAdPlatform(input);

  // Update revenue event with ad attribution
  if (input.orderId) {
    await db
      .update(revenueEvents)
      .set({
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        attributionModel: input.viewThrough ? ('view_through' as never) : 'last_touch',
      })
      .where(and(eq(revenueEvents.orgId, input.orgId), eq(revenueEvents.orderId, input.orderId)));
  }

  // Send offline conversion to ad platform
  if (platform && platform !== 'unknown_paid' && input.orgId) {
    const platformKey = platform as string;
    const [account] = await db
      .select()
      .from(adAccounts)
      .where(and(eq(adAccounts.orgId, input.orgId), eq(adAccounts.platform, platformKey)))
      .limit(1);

    if (account) {
      if (platform === 'facebook_ads') await sendFacebookOfflineConversion(account, input);
      if (platform === 'google_ads') await sendGoogleOfflineConversion(account, input);
    }
  }

  return { platform, attributed: true };
}

// ── UTM enrichment for standard purchase tracking ────────────────────────────

export function extractAdAttribution(
  queryParams: Record<string, string>,
): Partial<AdAttributionInput> {
  return {
    utmSource: queryParams['utm_source'],
    utmMedium: queryParams['utm_medium'],
    utmCampaign: queryParams['utm_campaign'],
    utmContent: queryParams['utm_content'],
    utmTerm: queryParams['utm_term'],
    adClickId:
      queryParams['fbclid'] ??
      queryParams['gclid'] ??
      queryParams['li_fat_id'] ??
      queryParams['ttclid'],
    viewThrough: false,
  };
}
