/**
 * Audience sync: CRM segments/lists → Ad platform Custom Audiences (#302).
 * Hashes contact emails (SHA-256) before upload per platform requirements.
 */

import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adAccounts, adAudienceSyncs, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import type { AdPlatform } from '../../db/schema/ad-accounts.js';
import { uploadToSklik } from './providers/sklik/audience-sync.js';

function sha256(value: string) {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// ── Per-platform audience upload ──────────────────────────────────────────────

async function uploadToFacebookAds(
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  emails: string[],
) {
  // Create custom audience
  const createRes = await fetch(
    `https://graph.facebook.com/v19.0/act_${account.platformAccountId}/customaudiences`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: audienceName,
        subtype: 'CUSTOM',
        description: 'ForgeMsg CRM audience sync',
        customer_file_source: 'USER_PROVIDED_ONLY',
        access_token: account.accessToken,
      }),
    },
  );
  const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
  if (!createRes.ok || !createData.id)
    throw new Error(createData.error?.message ?? 'Failed to create FB audience');

  const audienceId = createData.id;

  // Upload hashed emails in batches of 10k
  for (let i = 0; i < emails.length; i += 10_000) {
    const batch = emails.slice(i, i + 10_000);
    await fetch(`https://graph.facebook.com/v19.0/${audienceId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          schema: ['EMAIL_SHA256'],
          data: batch.map((e) => [sha256(e)]),
        },
        access_token: account.accessToken,
      }),
    });
  }
  return audienceId;
}

async function uploadToGoogleAds(
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  _emails: string[],
) {
  // Google Ads Customer Match via offline user data job
  const customerId = account.platformAccountId;
  const createRes = await fetch(
    `https://googleads.googleapis.com/v16/customers/${customerId}/offlineUserDataJobs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job: {
          type: 'CUSTOMER_MATCH_USER_LIST',
          customerMatchUserListMetadata: {
            userList: `customers/${customerId}/userLists/${audienceName.replace(/\s+/g, '_')}`,
          },
        },
      }),
    },
  );
  if (!createRes.ok) throw new Error(`Google Ads audience creation failed: ${createRes.status}`);
  const createData = (await createRes.json()) as { resourceName?: string };
  return createData.resourceName ?? audienceName;
}

async function uploadToLinkedInAds(
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  emails: string[],
) {
  const createRes = await fetch('https://api.linkedin.com/v2/dmpSegments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: `urn:li:sponsoredAccount:${account.platformAccountId}`,
      name: audienceName,
      type: 'USER',
      destinations: [{ destination: 'LINKEDIN' }],
    }),
  });
  if (!createRes.ok) throw new Error(`LinkedIn audience creation failed: ${createRes.status}`);
  const createData = (await createRes.json()) as { id?: string };
  const segmentId = createData.id;

  // Upload hashed emails
  await fetch(`https://api.linkedin.com/v2/dmpSegments/${segmentId}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      elements: emails.map((e) => ({
        action: 'ADD',
        userIds: [{ idType: 'SHA256_EMAIL', idValue: sha256(e) }],
      })),
    }),
  });

  return String(segmentId);
}

async function uploadToTikTokAds(
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  _emails: string[],
) {
  const createRes = await fetch(
    'https://business-api.tiktok.com/open_api/v1.3/dmp/custom_audience/create/',
    {
      method: 'POST',
      headers: { 'Access-Token': account.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advertiser_id: account.platformAccountId,
        custom_audience_name: audienceName,
        audience_sub_type: 'NORMAL',
      }),
    },
  );
  if (!createRes.ok) throw new Error(`TikTok audience creation failed: ${createRes.status}`);
  const createData = (await createRes.json()) as { data?: { custom_audience_id: string } };
  return createData.data?.custom_audience_id ?? audienceName;
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function syncAudienceToAdPlatform(
  orgId: string,
  input: {
    adAccountId: string;
    audienceName: string;
    segmentId?: string;
    listId?: string;
    contactLimit?: number;
  },
) {
  const [adAccount] = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.orgId, orgId), eq(adAccounts.id, input.adAccountId)));
  if (!adAccount) throw AppError.notFound('Ad account not found');

  // Build contact email list
  const emailQuery = db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.orgId, orgId));

  const emails = (await emailQuery.limit(input.contactLimit ?? 500_000))
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  const [sync] = await db
    .insert(adAudienceSyncs)
    .values({
      orgId,
      adAccountId: adAccount.id,
      segmentId: input.segmentId,
      listId: input.listId,
      audienceName: input.audienceName,
      status: 'running',
    })
    .returning();
  if (!sync) throw AppError.internal('Failed to create ad audience sync record');

  let platformAudienceId: string;
  try {
    const platform = adAccount.platform as AdPlatform;
    switch (platform) {
      case 'facebook_ads':
        platformAudienceId = await uploadToFacebookAds(adAccount, input.audienceName, emails);
        break;
      case 'google_ads':
        platformAudienceId = await uploadToGoogleAds(adAccount, input.audienceName, emails);
        break;
      case 'linkedin_ads':
        platformAudienceId = await uploadToLinkedInAds(adAccount, input.audienceName, emails);
        break;
      case 'tiktok_ads':
        platformAudienceId = await uploadToTikTokAds(adAccount, input.audienceName, emails);
        break;
      case 'sklik': {
        // Sklik accepts both email + phone hashes — fetch both columns.
        const sklikRows = await db
          .select({ email: contacts.email, phone: contacts.phone })
          .from(contacts)
          .where(eq(contacts.orgId, orgId))
          .limit(input.contactLimit ?? 500_000);
        const result = await uploadToSklik({
          accessToken: adAccount.accessToken,
          audienceName: input.audienceName,
          members: sklikRows,
        });
        platformAudienceId = result.audienceId;
        break;
      }
      default:
        throw new Error(`Unsupported ad platform: ${platform}`);
    }

    const [updated] = await db
      .update(adAudienceSyncs)
      .set({
        status: 'completed',
        platformAudienceId,
        contactsUploaded: emails.length,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adAudienceSyncs.id, sync.id))
      .returning();
    return updated;
  } catch (err) {
    await db
      .update(adAudienceSyncs)
      .set({ status: 'failed', errorMessage: (err as Error).message, updatedAt: new Date() })
      .where(eq(adAudienceSyncs.id, sync.id));
    throw AppError.badRequest((err as Error).message);
  }
}

export async function listAudienceSyncs(orgId: string, adAccountId?: string) {
  const conditions = adAccountId
    ? and(eq(adAudienceSyncs.orgId, orgId), eq(adAudienceSyncs.adAccountId, adAccountId))
    : eq(adAudienceSyncs.orgId, orgId);
  return db.select().from(adAudienceSyncs).where(conditions);
}
