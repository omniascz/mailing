/**
 * External feeds service (#286).
 *
 * Fetches RSS/CSV/JSON URLs on a schedule and either upserts contacts or fires
 * custom workflow events for each row. Triggered by a BullMQ cron worker or
 * manually via the API.
 */

import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  externalFeeds,
  contacts as contactsTable,
  type ExternalFeed,
} from '../../db/schema/index.js';
import { onApiEvent } from '../workflows/triggers.js';
import { AppError } from '../../lib/app-error.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedPollResult {
  feedId: string;
  itemsProcessed: number;
  errors: number;
  durationMs: number;
}

interface ParsedItem {
  [key: string]: string | undefined;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listExternalFeeds(orgId: string): Promise<ExternalFeed[]> {
  return db
    .select()
    .from(externalFeeds)
    .where(and(eq(externalFeeds.orgId, orgId), isNull(externalFeeds['deletedAt' as never])))
    .orderBy(externalFeeds.createdAt);
}

export async function getExternalFeed(orgId: string, feedId: string): Promise<ExternalFeed> {
  const [row] = await db
    .select()
    .from(externalFeeds)
    .where(and(eq(externalFeeds.orgId, orgId), eq(externalFeeds.id, feedId)))
    .limit(1);
  if (!row) throw AppError.notFound('External feed');
  return row;
}

export async function createExternalFeed(
  orgId: string,
  data: {
    name: string;
    feedUrl: string;
    format?: 'rss' | 'csv' | 'json';
    mapping?: Record<string, string>;
    schedule?: 'hourly' | 'daily' | 'weekly' | 'manual';
    action?: 'upsert_contact' | 'fire_event';
    eventName?: string;
    httpHeaders?: Record<string, string>;
  },
): Promise<ExternalFeed> {
  const [row] = await db
    .insert(externalFeeds)
    .values({
      orgId,
      name: data.name,
      feedUrl: data.feedUrl,
      format: data.format ?? 'json',
      mapping: data.mapping ?? {},
      schedule: data.schedule ?? 'daily',
      action: data.action ?? 'upsert_contact',
      eventName: data.eventName,
      httpHeaders: data.httpHeaders ?? {},
      nextRunAt: new Date(),
    })
    .returning();
  return row!;
}

export async function updateExternalFeed(
  orgId: string,
  feedId: string,
  data: Partial<{
    name: string;
    feedUrl: string;
    format: 'rss' | 'csv' | 'json';
    mapping: Record<string, string>;
    schedule: 'hourly' | 'daily' | 'weekly' | 'manual';
    action: 'upsert_contact' | 'fire_event';
    eventName: string;
    active: boolean;
    httpHeaders: Record<string, string>;
  }>,
): Promise<ExternalFeed> {
  const [row] = await db
    .update(externalFeeds)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(externalFeeds.orgId, orgId), eq(externalFeeds.id, feedId)))
    .returning();
  if (!row) throw AppError.notFound('External feed');
  return row;
}

export async function deleteExternalFeed(orgId: string, feedId: string): Promise<void> {
  const [row] = await db
    .delete(externalFeeds)
    .where(and(eq(externalFeeds.orgId, orgId), eq(externalFeeds.id, feedId)))
    .returning({ id: externalFeeds.id });
  if (!row) throw AppError.notFound('External feed');
}

// ─── Feed fetching ────────────────────────────────────────────────────────────

async function fetchRaw(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ text: string; contentType: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ForgeMsg/1.0 (+https://forgemsg.com)', ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  return { text, contentType };
}

function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  const tagRe = /<([a-zA-Z:_]+)[^>]*>([\s\S]*?)<\/\1>/g;
  for (const itemMatch of xml.matchAll(itemRe)) {
    const obj: ParsedItem = {};
    for (const tagMatch of (itemMatch[1] ?? '').matchAll(tagRe)) {
      const key = (tagMatch[1] ?? '').replace(/^.*:/, ''); // strip namespace
      obj[key] = (tagMatch[2] ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    }
    items.push(obj);
  }
  return items;
}

function parseCsv(text: string): ParsedItem[] {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headerLine = lines[0]!;
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj: ParsedItem = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? '';
    });
    return obj;
  });
}

function parseJson(text: string): ParsedItem[] {
  const data = JSON.parse(text) as unknown;
  const arr = Array.isArray(data) ? data : ((data as { items?: unknown[] }).items ?? [data]);
  return arr.map((item) => {
    const flat: ParsedItem = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      flat[k] = v != null ? String(v) : undefined;
    }
    return flat;
  });
}

function applyMapping(item: ParsedItem, mapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [src, target] of Object.entries(mapping)) {
    const val = item[src];
    if (val != null) out[target] = val;
  }
  return out;
}

// ─── Core poll logic ──────────────────────────────────────────────────────────

export async function pollFeed(feed: ExternalFeed): Promise<FeedPollResult> {
  const start = Date.now();
  let itemsProcessed = 0;
  let errors = 0;

  try {
    const { text } = await fetchRaw(feed.feedUrl, feed.httpHeaders ?? {});

    let items: ParsedItem[];
    if (feed.format === 'rss') {
      items = parseRss(text);
    } else if (feed.format === 'csv') {
      items = parseCsv(text);
    } else {
      items = parseJson(text);
    }

    for (const item of items) {
      try {
        const mapped = applyMapping(item, feed.mapping);

        const email = mapped['email'];
        if (!email) continue;

        // Find or create contact by email (upsert)
        let contactId: string;
        const [existing] = await db
          .select({ id: contactsTable.id })
          .from(contactsTable)
          .where(
            and(
              eq(contactsTable.orgId, feed.orgId),
              eq(contactsTable.email, email),
              isNull(contactsTable.deletedAt),
            ),
          )
          .limit(1);

        if (existing) {
          contactId = existing.id;
        } else {
          const [created] = await db
            .insert(contactsTable)
            .values({
              orgId: feed.orgId,
              email,
              firstName: mapped['first_name'],
              lastName: mapped['last_name'],
              phone: mapped['phone'],
            })
            .returning({ id: contactsTable.id });
          contactId = created!.id;
        }

        if (feed.action === 'upsert_contact') {
          // Update contact fields from mapped data
          await db
            .update(contactsTable)
            .set({
              firstName: mapped['first_name'] ?? undefined,
              lastName: mapped['last_name'] ?? undefined,
              phone: mapped['phone'] ?? undefined,
              updatedAt: new Date(),
            })
            .where(eq(contactsTable.id, contactId));
          await onApiEvent(feed.orgId, contactId, 'external_feed_item_updated', {
            feedId: feed.id,
            feedName: feed.name,
            ...mapped,
          }).catch(() => {});
        } else if (feed.action === 'fire_event' && feed.eventName) {
          await onApiEvent(feed.orgId, contactId, feed.eventName, {
            feedId: feed.id,
            ...mapped,
          }).catch(() => {});
        }

        itemsProcessed++;
      } catch {
        errors++;
      }
    }

    // Update last_fetched_at and compute next_run_at
    const nextRunAt = computeNextRun(feed.schedule);
    await db
      .update(externalFeeds)
      .set({
        lastFetchedAt: new Date(),
        lastItemCount: itemsProcessed,
        lastError: errors > 0 ? `${errors} item(s) failed` : null,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(externalFeeds.id, feed.id));
  } catch (err) {
    await db
      .update(externalFeeds)
      .set({
        lastFetchedAt: new Date(),
        lastError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(externalFeeds.id, feed.id));
    errors++;
  }

  return { feedId: feed.id, itemsProcessed, errors, durationMs: Date.now() - start };
}

function computeNextRun(schedule: string): Date {
  const d = new Date();
  switch (schedule) {
    case 'hourly':
      d.setHours(d.getHours() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'manual':
      d.setFullYear(d.getFullYear() + 10);
      break;
    default: // daily
      d.setDate(d.getDate() + 1);
  }
  return d;
}

// ─── Scheduler: poll all due feeds ───────────────────────────────────────────

export async function pollDueFeeds(): Promise<FeedPollResult[]> {
  const due = await db
    .select()
    .from(externalFeeds)
    .where(and(eq(externalFeeds.active, true), lte(externalFeeds.nextRunAt, sql`now()`)))
    .limit(50);

  return Promise.all(due.map(pollFeed));
}

// ─── Manual refresh ───────────────────────────────────────────────────────────

export async function refreshFeed(orgId: string, feedId: string): Promise<FeedPollResult> {
  const feed = await getExternalFeed(orgId, feedId);
  return pollFeed(feed);
}
