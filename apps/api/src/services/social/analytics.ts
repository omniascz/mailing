/**
 * Social analytics (#298) — followers, impressions, engagement, best-time-to-post.
 * Fetches from platform APIs, stores daily snapshots.
 */

import { eq, and, desc, gte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { socialAnalyticsSnapshots, socialAccounts, socialPosts } from '../../db/schema/index.js';


// ── Platform insight fetchers ─────────────────────────────────────────────────

async function fetchFacebookInsights(account: typeof socialAccounts.$inferSelect) {
  const fields = 'followers_count,fan_count';
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${account.platformUserId}?fields=${fields}&access_token=${account.accessToken}`,
  );
  if (!res.ok) return null;
  const d = await res.json() as { followers_count?: number; fan_count?: number };
  return { followers: d.followers_count ?? d.fan_count ?? 0, impressions: 0, reach: 0, engagements: 0 };
}

async function fetchInstagramInsights(account: typeof socialAccounts.$inferSelect) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${account.platformUserId}?fields=followers_count&access_token=${account.accessToken}`,
  );
  if (!res.ok) return null;
  const d = await res.json() as { followers_count?: number };
  return { followers: d.followers_count ?? 0, impressions: 0, reach: 0, engagements: 0 };
}

async function fetchLinkedInInsights(account: typeof socialAccounts.$inferSelect) {
  const res = await fetch(
    `https://api.linkedin.com/v2/networkSizes/urn:li:person:${account.platformUserId}?edgeType=CompanyFollowedByMember`,
    { headers: { Authorization: `Bearer ${account.accessToken}` } },
  );
  if (!res.ok) return null;
  const d = await res.json() as { firstDegreeSize?: number };
  return { followers: d.firstDegreeSize ?? 0, impressions: 0, reach: 0, engagements: 0 };
}

async function fetchTwitterMetrics(account: typeof socialAccounts.$inferSelect) {
  const res = await fetch(
    `https://api.twitter.com/2/users/${account.platformUserId}?user.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${account.accessToken}` } },
  );
  if (!res.ok) return null;
  const d = await res.json() as { data?: { public_metrics?: { followers_count?: number } } };
  return { followers: d.data?.public_metrics?.followers_count ?? 0, impressions: 0, reach: 0, engagements: 0 };
}

async function fetchPlatformInsights(account: typeof socialAccounts.$inferSelect) {
  switch (account.platform) {
    case 'facebook': return fetchFacebookInsights(account);
    case 'instagram': return fetchInstagramInsights(account);
    case 'linkedin': return fetchLinkedInInsights(account);
    case 'twitter': return fetchTwitterMetrics(account);
    default: return null;
  }
}

// ── Sync & snapshot ───────────────────────────────────────────────────────────

export async function syncAccountAnalytics(orgId: string) {
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.active, true)));

  const today = new Date().toISOString().slice(0, 10);
  const synced = [];

  for (const account of accounts) {
    try {
      const metrics = await fetchPlatformInsights(account);
      if (!metrics) continue;

      await db
        .insert(socialAnalyticsSnapshots)
        .values({
          orgId,
          accountId: account.id,
          date: today,
          ...metrics,
        })
        .onConflictDoNothing();

      synced.push({ accountId: account.id, platform: account.platform, metrics });
    } catch { /* skip failed accounts */ }
  }
  return synced;
}

// ── Aggregate analytics ───────────────────────────────────────────────────────

export async function getOrgAnalytics(orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const snapshots = await db
    .select()
    .from(socialAnalyticsSnapshots)
    .where(and(eq(socialAnalyticsSnapshots.orgId, orgId), gte(socialAnalyticsSnapshots.date, since)))
    .orderBy(desc(socialAnalyticsSnapshots.date));

  return snapshots;
}

export async function getAccountAnalytics(orgId: string, accountId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return db
    .select()
    .from(socialAnalyticsSnapshots)
    .where(and(
      eq(socialAnalyticsSnapshots.orgId, orgId),
      eq(socialAnalyticsSnapshots.accountId, accountId),
      gte(socialAnalyticsSnapshots.date, since),
    ))
    .orderBy(desc(socialAnalyticsSnapshots.date));
}

// ── Best time to post ─────────────────────────────────────────────────────────

export async function getBestTimeToPost(orgId: string) {
  // Aggregate published posts by hour-of-day, rank by engagements
  const posts = await db
    .select({
      engagements: socialPosts.engagements,
      publishedAt: socialPosts.publishedAt,
    })
    .from(socialPosts)
    .where(and(eq(socialPosts.orgId, orgId), eq(socialPosts.status, 'published')));

  const hourBuckets: Record<number, { totalEngagements: number; count: number }> = {};
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const hour = new Date(post.publishedAt).getUTCHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { totalEngagements: 0, count: 0 };
    hourBuckets[hour].totalEngagements += post.engagements;
    hourBuckets[hour].count += 1;
  }

  return Object.entries(hourBuckets)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      avgEngagements: data.count > 0 ? data.totalEngagements / data.count : 0,
      postCount: data.count,
    }))
    .sort((a, b) => b.avgEngagements - a.avgEngagements)
    .slice(0, 5);
}
