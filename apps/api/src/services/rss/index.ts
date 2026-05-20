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
  const res = await fetch(url, { headers: { 'User-Agent': 'MailForge-RSS/1.0' } });
  if (!res.ok) throw AppError.badRequest(`RSS fetch failed: ${String(res.status)}`);
  const xml = await res.text();
  return parseRssXml(xml);
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
      content: { items: fresh, sourceFeed: rss.feedUrl, generatedFrom: 'rss' },
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
