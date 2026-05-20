/**
 * Social account OAuth connect/disconnect (#293).
 *
 * OAuth flow per platform:
 *   1. GET  /api/v1/social/accounts/connect/:platform  → redirect to platform auth URL
 *   2. GET  /api/v1/social/accounts/callback/:platform → exchange code, save tokens
 *
 * Token refresh is handled lazily on each API call.
 */

import { randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { socialAccounts, socialOauthStates } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import type { SocialPlatform } from '../../db/schema/social-accounts.js';

// ── OAuth config per platform ─────────────────────────────────────────────────

interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  userInfoUrl: string;
}

function getOAuthConfig(platform: SocialPlatform): OAuthConfig {
  const cfg: Record<SocialPlatform, OAuthConfig> = {
    facebook: {
      authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
      clientId: process.env.FACEBOOK_APP_ID ?? '',
      clientSecret: process.env.FACEBOOK_APP_SECRET ?? '',
      scope: 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
      userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,picture',
    },
    instagram: {
      // Instagram uses Facebook OAuth
      authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
      clientId: process.env.FACEBOOK_APP_ID ?? '',
      clientSecret: process.env.FACEBOOK_APP_SECRET ?? '',
      scope: 'instagram_basic,instagram_content_publish,instagram_manage_comments',
      userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,picture',
    },
    linkedin: {
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientId: process.env.LINKEDIN_CLIENT_ID ?? '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      scope: 'w_member_social,r_organization_social,rw_organization_admin',
      userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    },
    twitter: {
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      clientId: process.env.TWITTER_CLIENT_ID ?? '',
      clientSecret: process.env.TWITTER_CLIENT_SECRET ?? '',
      scope: 'tweet.read tweet.write users.read offline.access',
      userInfoUrl: 'https://api.twitter.com/2/users/me',
    },
    tiktok: {
      authUrl: 'https://www.tiktok.com/v2/auth/authorize',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      clientId: process.env.TIKTOK_CLIENT_KEY ?? '',
      clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      scope: 'user.info.basic,video.publish,video.upload',
      userInfoUrl:
        'https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,open_id',
    },
  };
  return cfg[platform];
}

// ── Initiate OAuth flow ───────────────────────────────────────────────────────

export async function initiateOAuth(
  orgId: string,
  userId: string,
  platform: SocialPlatform,
  callbackBase: string,
) {
  const cfg = getOAuthConfig(platform);
  if (!cfg.clientId) throw AppError.badRequest(`${platform} OAuth not configured`);

  const state = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db.insert(socialOauthStates).values({ orgId, userId, platform, state, expiresAt });

  const redirectUri = `${callbackBase}/api/v1/social/accounts/callback/${platform}`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state,
  });

  return `${cfg.authUrl}?${params}`;
}

// ── Handle OAuth callback ─────────────────────────────────────────────────────

async function fetchUserInfo(platform: SocialPlatform, accessToken: string) {
  const cfg = getOAuthConfig(platform);
  const res = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`User info fetch failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function handleOAuthCallback(
  platform: SocialPlatform,
  code: string,
  state: string,
  callbackBase: string,
) {
  // Validate state
  const [stateRow] = await db
    .select()
    .from(socialOauthStates)
    .where(eq(socialOauthStates.state, state));

  if (!stateRow || stateRow.expiresAt < new Date()) {
    throw AppError.badRequest('Invalid or expired OAuth state');
  }

  await db.delete(socialOauthStates).where(eq(socialOauthStates.state, state));

  const cfg = getOAuthConfig(platform);
  const redirectUri = `${callbackBase}/api/v1/social/accounts/callback/${platform}`;

  // Exchange code for tokens
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
    scope?: string;
  };

  // Fetch user profile
  const userInfo = await fetchUserInfo(platform, tokens.access_token);
  const platformUserId = String(
    userInfo.id ?? userInfo.sub ?? (userInfo.data as Record<string, unknown>)?.open_id ?? '',
  );
  const displayName = String(userInfo.name ?? userInfo.display_name ?? '');
  const avatarUrl = String(
    (userInfo.picture as Record<string, unknown>)?.data
      ? ((userInfo.picture as Record<string, unknown>).data as Record<string, unknown>)?.url
      : (userInfo.picture ?? (userInfo.data as Record<string, unknown>)?.avatar_url ?? ''),
  );

  const tokenExpiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

  // Upsert account
  const [account] = await db
    .insert(socialAccounts)
    .values({
      orgId: stateRow.orgId,
      platform,
      platformUserId,
      displayName,
      avatarUrl: avatarUrl || undefined,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      tokenExpiresAt: tokenExpiresAt ?? undefined,
      scopes: tokens.scope ?? cfg.scope,
      active: true,
    })
    .onConflictDoUpdate({
      target: [socialAccounts.orgId, socialAccounts.platform, socialAccounts.platformUserId],
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiresAt: tokenExpiresAt ?? undefined,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return account;
}

// ── List / disconnect ─────────────────────────────────────────────────────────

export async function listSocialAccounts(orgId: string) {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.active, true)));

  // Don't expose tokens
  return rows.map(({ accessToken: _, refreshToken: __, ...rest }) => rest);
}

export async function disconnectSocialAccount(orgId: string, accountId: string) {
  const [row] = await db
    .update(socialAccounts)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.id, accountId)))
    .returning({ id: socialAccounts.id });
  if (!row) throw AppError.notFound('Social account not found');
}
