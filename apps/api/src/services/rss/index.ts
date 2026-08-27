/**
 * RSS-to-email automation — polls a feed, detects new items by guid,
 * renders a campaign and dispatches it through the normal send pipeline.
 */

import { and, eq, lte } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  rssCampaigns,
  campaigns,
  type RssCampaign,
  type NewRssCampaign,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { safeFetch, BlockedUrlError } from '../../lib/safe-fetch.js';
import { buildRssCampaignContent } from './email-schema.js';

export interface RssItem {
  guid: string;
  title: string;
  link: string;
  description?: string;
  pubDate?: Date;
}

export async function createRssCampaign(
  orgId: string,
  data: Omit<NewRssCampaign, 'id' | 'orgId'>,
): Promise<RssCampaign> {
  const [row] = await db
    .insert(rssCampaigns)
    .values({
      ...data,
      orgId,
      nextRunAt:
        data.nextRunAt ?? computeNextRun(data.frequency ?? 'daily', data.sendTime ?? '09:00'),
    })
    .returning();
  return row!;
}

export async function listRssCampaigns(orgId: string): Promise<RssCampaign[]> {
  return db.select().from(rssCampaigns).where(eq(rssCampaigns.orgId, orgId));
}

export async function getRssCampaign(id: string, orgId: string): Promise<RssCampaign> {
  const [row] = await db
    .select()
    .from(rssCampaigns)
    .where(and(eq(rssCampaigns.id, id), eq(rssCampaigns.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('RssCampaign');
  return row;
}

export async function parseFeed(url: string): Promise<RssItem[]> {
  // Customer-supplied URL — guarded, see lib/safe-fetch. A feed is XML, so the
  // 1 MB cap is generous; without one this is a memory-exhaustion lever too.
  let res;
  try {
    res = await safeFetch(url, {
      headers: { 'User-Agent': 'MailForge-RSS/1.0' },
      maxBytes: 1024 * 1024,
    });
  } catch (err) {
    if (err instanceof BlockedUrlError) throw AppError.badRequest(err.message);
    throw AppError.badRequest(`RSS fetch failed: ${(err as Error).message}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw AppError.badRequest(`RSS fetch failed: ${String(res.status)}`);
  }
  return parseRssXml(res.body);
}

/**
 * Very small RSS/Atom parser — extracts <item> or <entry> tags.
 * Avoids adding xml2js as a dependency for this single use case.
 */
export function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const inner = m[2]!;
    const pick = (tag: string): string | undefined => {
      const tagRe = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const mm = tagRe.exec(inner);
      return mm?.[1]?.trim();
    };
    const linkHref = /<link[^>]*href=["']([^"']+)["']/i.exec(inner)?.[1];
    const title = cleanText(pick('title') ?? '');
    const link = cleanText(pick('link') ?? linkHref ?? '');
    const guid = cleanText(pick('guid') ?? pick('id') ?? link);
    const desc = cleanText(pick('description') ?? pick('summary') ?? pick('content') ?? '');
    const pub = pick('pubDate') ?? pick('published') ?? pick('updated');
    items.push({
      guid: guid || title,
      title,
      link,
      description: desc,
      pubDate: pub ? new Date(pub) : undefined,
    });
  }
  return items;
}

function cleanText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function computeNextRun(frequency: string, sendTime: string): Date {
  const [h = '9', m = '0'] = sendTime.split(':');
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(Number(h), Number(m), 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === 'hourly') {
    next.setTime(now.getTime() + 60 * 60 * 1000);
  }
  return next;
}

/** Run any RSS campaigns that are due — called by worker cron. */
export async function runDueRssCampaigns(now: Date = new Date()): Promise<{ processed: number }> {
  const due = await db
    .select()
    .from(rssCampaigns)
    .where(and(eq(rssCampaigns.active, true), lte(rssCampaigns.nextRunAt, now)));

  let processed = 0;
  for (const rss of due) {
    try {
      await processOne(rss);
      processed++;
    } catch {
      // swallow — next run-through will retry.
    }
  }
  return { processed };
}

async function processOne(rss: RssCampaign): Promise<void> {
  const items = await parseFeed(rss.feedUrl);
  const seen = new Set(rss.lastSeenGuids);
  const fresh = items.filter((i) => !seen.has(i.guid)).slice(0, 10);

  if (fresh.length > 0 && rss.listId) {
    const subject = rss.subjectTemplate.replace('{{rss.title}}', fresh[0]!.title);
    await db.insert(campaigns).values({
      orgId: rss.orgId,
      name: `${rss.name} — ${new Date().toISOString().slice(0, 10)}`,
      type: 'email',
      status: 'scheduled',
      subject,
      fromName: rss.fromName,
      fromEmail: rss.fromEmail,
      listId: rss.listId,
      // A block schema, not the parsed feed. Storing `{ items, … }` made a
      // fourth shape of campaigns.content that readCampaignContent reports as
      // 'unknown', so the send path fell to its last branch and put
      // JSON.stringify of the feed in the body. See ./email-schema.ts.
      //
      // sourceFeed/generatedFrom ride along as provenance; emailSchema strips
      // unknown keys when it parses, so they change nothing about the render.
      content: buildRssCampaignContent(subject, fresh, rss.feedUrl),
      scheduledAt: new Date(),
    });
  }

  const newGuids = items.map((i) => i.guid).slice(0, 200);
  await db
    .update(rssCampaigns)
    .set({
      lastSeenGuids: newGuids,
      lastSentAt: fresh.length > 0 ? new Date() : rss.lastSentAt,
      nextRunAt: computeNextRun(rss.frequency, rss.sendTime),
    })
    .where(eq(rssCampaigns.id, rss.id));
}
