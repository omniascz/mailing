/**
 * Social post publishing & scheduling (#294).
 * Publishes to multiple platforms via their respective APIs.
 * Scheduled posts are dispatched by a BullMQ worker.
 */

import { eq, and, lte, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { socialPosts, socialAccounts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import type { SocialPlatform } from '../../db/schema/social-accounts.js';

// ── Per-platform publish adapters ─────────────────────────────────────────────

interface PublishResult {
  accountId: string;
  platformPostId: string | null;
  url: string | null;
  error: string | null;
}

async function publishToFacebook(
  account: typeof socialAccounts.$inferSelect,
  caption: string,
  mediaUrls: string[],
): Promise<PublishResult> {
  const pageId = account.platformUserId;
  const body: Record<string, string> = { message: caption, access_token: account.accessToken };
  if (mediaUrls.length === 1 && mediaUrls[0]) body['link'] = mediaUrls[0];

  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || json.error) {
    return {
      accountId: account.id,
      platformPostId: null,
      url: null,
      error: json.error?.message ?? 'Unknown error',
    };
  }
  return {
    accountId: account.id,
    platformPostId: json.id ?? null,
    url: json.id ? `https://www.facebook.com/${json.id}` : null,
    error: null,
  };
}

async function publishToInstagram(
  account: typeof socialAccounts.$inferSelect,
  caption: string,
  mediaUrls: string[],
): Promise<PublishResult> {
  if (!mediaUrls.length) {
    return {
      accountId: account.id,
      platformPostId: null,
      url: null,
      error: 'Instagram requires at least one media URL',
    };
  }
  // Step 1: create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${account.platformUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: mediaUrls[0], caption, access_token: account.accessToken }),
    },
  );
  const container = (await containerRes.json()) as { id?: string; error?: { message: string } };
  if (!containerRes.ok || !container.id) {
    return {
      accountId: account.id,
      platformPostId: null,
      url: null,
      error: container.error?.message ?? 'Media container creation failed',
    };
  }
  // Step 2: publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${account.platformUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: account.accessToken }),
    },
  );
  const pub = (await publishRes.json()) as { id?: string; error?: { message: string } };
  return {
    accountId: account.id,
    platformPostId: pub.id ?? null,
    url: pub.id ? `https://www.instagram.com/p/${pub.id}` : null,
    error: pub.error?.message ?? null,
  };
}

async function publishToLinkedIn(
  account: typeof socialAccounts.$inferSelect,
  caption: string,
): Promise<PublishResult> {
  const body = {
    author: `urn:li:person:${account.platformUserId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  return {
    accountId: account.id,
    platformPostId: json.id ?? null,
    url: json.id ? `https://www.linkedin.com/feed/update/${json.id}` : null,
    error: res.ok ? null : (json.message ?? 'LinkedIn publish failed'),
  };
}

async function publishToTwitter(
  account: typeof socialAccounts.$inferSelect,
  caption: string,
): Promise<PublishResult> {
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: caption.slice(0, 280) }),
  });
  const json = (await res.json()) as { data?: { id: string }; errors?: Array<{ message: string }> };
  return {
    accountId: account.id,
    platformPostId: json.data?.id ?? null,
    url: json.data?.id ? `https://twitter.com/i/web/status/${json.data.id}` : null,
    error: json.errors?.[0]?.message ?? (res.ok ? null : 'Twitter publish failed'),
  };
}

async function publishToTikTok(
  account: typeof socialAccounts.$inferSelect,
  caption: string,
  mediaUrls: string[],
): Promise<PublishResult> {
  if (!mediaUrls.length) {
    return {
      accountId: account.id,
      platformPostId: null,
      url: null,
      error: 'TikTok requires video URL',
    };
  }
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: { source: 'PULL_FROM_URL', video_url: mediaUrls[0] },
    }),
  });
  const json = (await res.json()) as { data?: { publish_id: string }; error?: { message: string } };
  return {
    accountId: account.id,
    platformPostId: json.data?.publish_id ?? null,
    url: null,
    error: json.error?.message ?? (res.ok ? null : 'TikTok publish failed'),
  };
}

async function publishToAccount(
  account: typeof socialAccounts.$inferSelect,
  caption: string,
  mediaUrls: string[],
): Promise<PublishResult> {
  const platform = account.platform as SocialPlatform;
  switch (platform) {
    case 'facebook':
      return publishToFacebook(account, caption, mediaUrls);
    case 'instagram':
      return publishToInstagram(account, caption, mediaUrls);
    case 'linkedin':
      return publishToLinkedIn(account, caption);
    case 'twitter':
      return publishToTwitter(account, caption);
    case 'tiktok':
      return publishToTikTok(account, caption, mediaUrls);
    default:
      return {
        accountId: account.id,
        platformPostId: null,
        url: null,
        error: `Unknown platform: ${platform}`,
      };
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createSocialPost(
  orgId: string,
  input: {
    caption?: string;
    mediaUrls?: string[];
    linkUrl?: string;
    hashtags?: string[];
    accountIds: string[];
    scheduledAt?: Date;
  },
) {
  const [row] = await db
    .insert(socialPosts)
    .values({
      orgId,
      caption: input.caption,
      mediaUrls: input.mediaUrls ?? [],
      linkUrl: input.linkUrl,
      hashtags: input.hashtags ?? [],
      accountIds: input.accountIds,
      status: input.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: input.scheduledAt,
    })
    .returning();
  return row;
}

export async function listSocialPosts(
  orgId: string,
  opts?: { status?: string; from?: Date; to?: Date; limit?: number },
) {
  const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');
  let q = db.select().from(socialPosts).where(drizzleEq(socialPosts.orgId, orgId)).$dynamic();
  if (opts?.status)
    q = q.where(
      drizzleAnd(drizzleEq(socialPosts.orgId, orgId), drizzleEq(socialPosts.status, opts.status)),
    );
  return q.orderBy(desc(socialPosts.scheduledAt)).limit(opts?.limit ?? 50);
}

export async function getSocialPost(orgId: string, postId: string) {
  const [row] = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.orgId, orgId), eq(socialPosts.id, postId)));
  if (!row) throw AppError.notFound('Post not found');
  return row;
}

export async function updateSocialPost(
  orgId: string,
  postId: string,
  input: {
    caption?: string;
    mediaUrls?: string[];
    hashtags?: string[];
    accountIds?: string[];
    scheduledAt?: Date | null;
    status?: string;
  },
) {
  const [row] = await db
    .update(socialPosts)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(socialPosts.orgId, orgId), eq(socialPosts.id, postId)))
    .returning();
  if (!row) throw AppError.notFound('Post not found');
  return row;
}

export async function deleteSocialPost(orgId: string, postId: string) {
  const [row] = await db
    .delete(socialPosts)
    .where(and(eq(socialPosts.orgId, orgId), eq(socialPosts.id, postId)))
    .returning({ id: socialPosts.id });
  if (!row) throw AppError.notFound('Post not found');
}

// ── Publish immediately ───────────────────────────────────────────────────────

export async function publishSocialPost(orgId: string, postId: string) {
  const post = await getSocialPost(orgId, postId);
  const accountIdList = post.accountIds as string[];

  const accounts = await Promise.all(
    accountIdList.map((id) =>
      db
        .select()
        .from(socialAccounts)
        .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, orgId)))
        .then((r) => r[0]),
    ),
  );
  const validAccounts = accounts.filter(Boolean);

  const caption = [post.caption ?? '', ...(post.hashtags as string[]).map((h) => `#${h}`)]
    .filter(Boolean)
    .join(' ');
  const mediaUrls = post.mediaUrls as string[];

  const results: PublishResult[] = await Promise.all(
    validAccounts.map((a) => publishToAccount(a!, caption, mediaUrls)),
  );

  const allFailed = results.every((r) => r.error !== null);
  const status = allFailed ? 'failed' : 'published';

  const [updated] = await db
    .update(socialPosts)
    .set({ status, publishedAt: new Date(), results, updatedAt: new Date() })
    .where(eq(socialPosts.id, postId))
    .returning();

  return updated!;
}

// ── Scheduled posts dispatch ──────────────────────────────────────────────────

export async function dispatchDuePosts() {
  const now = new Date();
  const due = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.status, 'scheduled'), lte(socialPosts.scheduledAt, now)));

  const results = [];
  for (const post of due) {
    try {
      const published = await publishSocialPost(post.orgId, post.id);
      results.push({ postId: post.id, status: published.status });
    } catch (err) {
      await db
        .update(socialPosts)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(socialPosts.id, post.id));
      results.push({ postId: post.id, status: 'failed', error: (err as Error).message });
    }
  }
  return results;
}
