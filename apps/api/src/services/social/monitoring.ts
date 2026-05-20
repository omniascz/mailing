/**
 * Social monitoring (#296) — tracks brand mentions and keyword hits across platforms.
 * Fetches mentions via platform APIs, stores them, and fires workflow events.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { socialMentions, socialMonitoringKeywords, socialAccounts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ── Keyword CRUD ──────────────────────────────────────────────────────────────

export async function addMonitoringKeyword(
  orgId: string,
  keyword: string,
  platforms: string[] = [],
) {
  const [row] = await db
    .insert(socialMonitoringKeywords)
    .values({ orgId, keyword, platforms })
    .returning();
  return row;
}

export async function listMonitoringKeywords(orgId: string) {
  return db
    .select()
    .from(socialMonitoringKeywords)
    .where(eq(socialMonitoringKeywords.orgId, orgId));
}

export async function removeMonitoringKeyword(orgId: string, keywordId: string) {
  const [row] = await db
    .delete(socialMonitoringKeywords)
    .where(
      and(eq(socialMonitoringKeywords.orgId, orgId), eq(socialMonitoringKeywords.id, keywordId)),
    )
    .returning({ id: socialMonitoringKeywords.id });
  if (!row) throw AppError.notFound('Keyword not found');
}

// ── Mention ingestion ─────────────────────────────────────────────────────────

async function classifySentiment(body: string): Promise<'positive' | 'neutral' | 'negative'> {
  const lower = body.toLowerCase();
  const positive = ['love', 'great', 'excellent', 'amazing', 'fantastic', 'good', '❤️', '👍', '🎉'];
  const negative = ['hate', 'terrible', 'awful', 'bad', 'worst', 'broken', 'fail', '👎', '😡'];
  const posScore = positive.filter((w) => lower.includes(w)).length;
  const negScore = negative.filter((w) => lower.includes(w)).length;
  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

export async function ingestMention(
  orgId: string,
  input: {
    platform: string;
    platformMentionId: string;
    type?: string;
    authorUsername?: string;
    authorId?: string;
    body?: string;
    url?: string;
    matchedKeyword?: string;
    mentionedAt?: Date;
    rawData?: Record<string, unknown>;
  },
) {
  const sentiment = input.body ? await classifySentiment(input.body) : 'neutral';

  const [row] = await db
    .insert(socialMentions)
    .values({
      orgId,
      platform: input.platform,
      platformMentionId: input.platformMentionId,
      type: input.type ?? 'mention',
      authorUsername: input.authorUsername,
      authorId: input.authorId,
      body: input.body,
      url: input.url,
      sentiment,
      matchedKeyword: input.matchedKeyword,
      mentionedAt: input.mentionedAt ?? new Date(),
      rawData: input.rawData ?? {},
    })
    .onConflictDoNothing()
    .returning();

  return row;
}

// ── Twitter search for keywords ───────────────────────────────────────────────

async function pollTwitterMentions(account: typeof socialAccounts.$inferSelect, keyword: string) {
  const res = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(keyword)}&max_results=10&tweet.fields=author_id,created_at,text`,
    { headers: { Authorization: `Bearer ${account.accessToken}` } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{ id: string; text: string; author_id: string; created_at: string }>;
  };
  return json.data ?? [];
}

// ── Run monitoring poll ───────────────────────────────────────────────────────

export async function runMonitoringPoll(orgId: string) {
  const keywords = await listMonitoringKeywords(orgId);
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.orgId, orgId), eq(socialAccounts.active, true)));

  let ingested = 0;

  for (const kw of keywords) {
    const platforms =
      (kw.platforms as string[]).length > 0 ? (kw.platforms as string[]) : ['twitter'];

    for (const platform of platforms) {
      const account = accounts.find((a) => a.platform === platform);
      if (!account) continue;

      if (platform === 'twitter') {
        const tweets = await pollTwitterMentions(account, kw.keyword);
        for (const tweet of tweets) {
          const row = await ingestMention(orgId, {
            platform: 'twitter',
            platformMentionId: tweet.id,
            type: 'mention',
            authorId: tweet.author_id,
            body: tweet.text,
            url: `https://twitter.com/i/web/status/${tweet.id}`,
            matchedKeyword: kw.keyword,
            mentionedAt: new Date(tweet.created_at),
            rawData: tweet as never,
          });
          if (row) ingested++;
        }
      }
    }
  }

  return { ingested };
}

// ── Mention list / update ─────────────────────────────────────────────────────

export async function listMentions(
  orgId: string,
  opts?: { status?: string; platform?: string; limit?: number },
) {
  return db
    .select()
    .from(socialMentions)
    .where(eq(socialMentions.orgId, orgId))
    .orderBy(desc(socialMentions.mentionedAt))
    .limit(opts?.limit ?? 50);
}

export async function updateMentionStatus(orgId: string, mentionId: string, status: string) {
  const [row] = await db
    .update(socialMentions)
    .set({ status })
    .where(and(eq(socialMentions.orgId, orgId), eq(socialMentions.id, mentionId)))
    .returning();
  if (!row) throw AppError.notFound('Mention not found');
  return row;
}
