/**
 * Ad platform account connections (#301).
 * OAuth for Facebook Ads / Google Ads / LinkedIn Ads / TikTok Ads.
 */

import { randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adAccounts, socialOauthStates } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import type { AdPlatform } from '../../db/schema/ad-accounts.js';

// ── OAuth config ──────────────────────────────────────────────────────────────

interface AdOAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  accountsUrl: string; // to fetch available ad account list after auth
}

function getAdOAuthConfig(platform: AdPlatform): AdOAuthConfig {
  const cfg: Record<AdPlatform, AdOAuthConfig> = {
    facebook_ads: {
      authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
      clientId: process.env.FACEBOOK_APP_ID ?? '',
      clientSecret: process.env.FACEBOOK_APP_SECRET ?? '',
      scope: 'ads_management,ads_read,business_management',
      accountsUrl: 'https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status',
    },
    google_ads: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
      scope: 'https://www.googleapis.com/auth/adwords',
      accountsUrl: 'https://googleads.googleapis.com/v16/customers:listAccessibleCustomers',
    },
    linkedin_ads: {
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientId: process.env.LINKEDIN_CLIENT_ID ?? '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      scope: 'r_ads,w_ads,r_ads_reporting',
      accountsUrl:
        'https://api.linkedin.com/v2/adAccountsV2?q=search&search.status.values[0]=ACTIVE',
    },
    tiktok_ads: {
      authUrl: 'https://ads.tiktok.com/marketing_api/auth',
      tokenUrl: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
      clientId: process.env.TIKTOK_ADS_APP_ID ?? '',
      clientSecret: process.env.TIKTOK_ADS_SECRET ?? '',
      scope: 'ad_management',
      accountsUrl: 'https://business-api.tiktok.com/open_api/v1.3/advertiser/info/',
    },
    sklik: {
      // Sklik OAuth lives under integrations/sklik (#420). The generic ads-account
      // OAuth path uses these fields for symmetry; the dedicated integration
      // exposes the actual flow.
      authUrl: 'https://login.szn.cz/api/v1/oauth/auth',
      tokenUrl: 'https://login.szn.cz/api/v1/oauth/token',
      clientId: process.env.SKLIK_CLIENT_ID ?? '',
      clientSecret: process.env.SKLIK_CLIENT_SECRET ?? '',
      scope: 'user.read campaign.read campaign.write',
      accountsUrl: 'https://api.sklik.cz/drak/json/users.list',
    },
  };
  return cfg[platform];
}

// ── Initiate OAuth ────────────────────────────────────────────────────────────

export async function initiateAdOAuth(
  orgId: string,
  userId: string,
  platform: AdPlatform,
  callbackBase: string,
) {
  const cfg = getAdOAuthConfig(platform);
  if (!cfg.clientId) throw AppError.badRequest(`${platform} OAuth not configured`);

  const state = randomBytes(32).toString('hex');
  // Reuse social_oauth_states table with platform prefixed as 'ads_facebook_ads' etc
  await db.insert(socialOauthStates).values({
    orgId,
    userId,
    platform: `ads_${platform}`,
    state,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const redirectUri = `${callbackBase}/api/v1/ads/accounts/callback/${platform}`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state,
  });
  return `${cfg.authUrl}?${params}`;
}

// ── Handle callback ───────────────────────────────────────────────────────────

async function fetchAdAccounts(platform: AdPlatform, accessToken: string, cfg: AdOAuthConfig) {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (platform === 'google_ads')
    headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '';

  const res = await fetch(cfg.accountsUrl, { headers });
  if (!res.ok) return [];

  const json = (await res.json()) as Record<string, unknown>;

  switch (platform) {
    case 'facebook_ads': {
      const data = (json.data as Array<{ id: string; name: string }>) ?? [];
      return data.map((a) => ({ id: a.id.replace('act_', ''), name: a.name }));
    }
    case 'google_ads': {
      const ids = (json.resourceNames as string[]) ?? [];
      return ids.map((r) => ({ id: r.replace('customers/', ''), name: r }));
    }
    case 'linkedin_ads': {
      const elements =
        (json.elements as Array<{ id: string; name?: { localized?: { en_US?: string } } }>) ?? [];
      return elements.map((e) => ({
        id: String(e.id),
        name: e.name?.localized?.en_US ?? String(e.id),
      }));
    }
    case 'tiktok_ads': {
      const list =
        ((json.data as Record<string, unknown>)?.list as Array<{
          advertiser_id: string;
          advertiser_name: string;
        }>) ?? [];
      return list.map((a) => ({ id: a.advertiser_id, name: a.advertiser_name }));
    }
    default:
      return [];
  }
}

export async function handleAdOAuthCallback(
  platform: AdPlatform,
  code: string,
  state: string,
  callbackBase: string,
) {
  const [stateRow] = await db
    .select()
    .from(socialOauthStates)
    .where(eq(socialOauthStates.state, state));

  if (!stateRow || stateRow.expiresAt < new Date())
    throw AppError.badRequest('Invalid or expired OAuth state');
  await db.delete(socialOauthStates).where(eq(socialOauthStates.state, state));

  const cfg = getAdOAuthConfig(platform);
  const redirectUri = `${callbackBase}/api/v1/ads/accounts/callback/${platform}`;

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
  });
  if (!tokenRes.ok) throw AppError.badRequest(`Token exchange failed: ${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const adAccountList = await fetchAdAccounts(platform, tokens.access_token, cfg);
  const tokenExpiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

  // Connect first available ad account (or all of them)
  const connected = [];
  for (const acc of adAccountList.slice(0, 5)) {
    const [row] = await db
      .insert(adAccounts)
      .values({
        orgId: stateRow.orgId,
        platform,
        platformAccountId: acc.id,
        accountName: acc.name,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiresAt: tokenExpiresAt ?? undefined,
        active: true,
      })
      .onConflictDoUpdate({
        target: [adAccounts.orgId, adAccounts.platform, adAccounts.platformAccountId],
        set: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    connected.push({ id: row!.id, platform, accountName: acc.name });
  }
  return connected;
}

// ── List / disconnect ─────────────────────────────────────────────────────────

export async function listAdAccounts(orgId: string) {
  const rows = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.orgId, orgId), eq(adAccounts.active, true)));
  return rows.map(({ accessToken: _, refreshToken: __, ...rest }) => rest);
}

export async function disconnectAdAccount(orgId: string, accountId: string) {
  const [row] = await db
    .update(adAccounts)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(adAccounts.orgId, orgId), eq(adAccounts.id, accountId)))
    .returning({ id: adAccounts.id });
  if (!row) throw AppError.notFound('Ad account not found');
}
