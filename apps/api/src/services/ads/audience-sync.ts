/**
 * Audience sync: CRM segments/lists → Ad platform Custom Audiences (#302).
 *
 * Per-platform hashers + HTTP transport live in their own provider
 * directories (services/ads/providers/{meta,google,tiktok,sklik}/).
 * This module is the org-scoped orchestrator that decides which
 * provider to call and persists the audit row.
 */

import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adAccounts, adAudienceSyncs, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import type { AdPlatform } from '../../db/schema/ad-accounts.js';
import { uploadToSklik } from './providers/sklik/audience-sync.js';
import { uploadToMeta } from './providers/meta/audience-sync.js';
import { uploadToGoogle } from './providers/google/audience-sync.js';
import { uploadToTikTok } from './providers/tiktok/audience-sync.js';

function sha256(value: string) {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// ── Per-platform audience upload ──────────────────────────────────────────────

async function uploadToFacebookAds(
  orgId: string,
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  contactLimit: number | undefined,
): Promise<string> {
  const rows = await db
    .select({
      email: contacts.email,
      phone: contacts.phone,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(eq(contacts.orgId, orgId))
    .limit(contactLimit ?? 500_000);
  const result = await uploadToMeta({
    accessToken: account.accessToken,
    adAccountId: account.platformAccountId,
    audienceName,
    members: rows,
  });
  return result.audienceId;
}

async function uploadToGoogleAds(
  orgId: string,
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  contactLimit: number | undefined,
): Promise<string> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN env var is not set');
  const rows = await db
    .select({
      email: contacts.email,
      phone: contacts.phone,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(eq(contacts.orgId, orgId))
    .limit(contactLimit ?? 500_000);
  const result = await uploadToGoogle({
    accessToken: account.accessToken,
    developerToken: devToken,
    customerId: account.platformAccountId,
    audienceName,
    members: rows,
  });
  return result.jobResourceName;
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
  orgId: string,
  account: typeof adAccounts.$inferSelect,
  audienceName: string,
  contactLimit: number | undefined,
): Promise<string> {
  const rows = await db
    .select({ email: contacts.email, phone: contacts.phone })
    .from(contacts)
    .where(eq(contacts.orgId, orgId))
    .limit(contactLimit ?? 500_000);
  const result = await uploadToTikTok({
    accessToken: account.accessToken,
    advertiserId: account.platformAccountId,
    audienceName,
    members: rows,
  });
  return result.customAudienceId;
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
        platformAudienceId = await uploadToFacebookAds(
          orgId,
          adAccount,
          input.audienceName,
          input.contactLimit,
        );
        break;
      case 'google_ads':
        platformAudienceId = await uploadToGoogleAds(
          orgId,
          adAccount,
          input.audienceName,
          input.contactLimit,
        );
        break;
      case 'linkedin_ads':
        platformAudienceId = await uploadToLinkedInAds(adAccount, input.audienceName, emails);
        break;
      case 'tiktok_ads':
        platformAudienceId = await uploadToTikTokAds(
          orgId,
          adAccount,
          input.audienceName,
          input.contactLimit,
        );
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
