/**
 * Search ranking tracker (#292).
 * Polls DataForSEO SERP API for keyword positions, stores daily snapshots.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { seoRankTracking, seoRankSnapshots } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

function dfsCreds() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw AppError.badRequest('DataForSEO credentials not configured');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

function countryToLocation(country: string): number {
  const map: Record<string, number> = { US: 2840, GB: 2826, DE: 2276, CZ: 2203, SK: 2703 };
  return map[country.toUpperCase()] ?? 2840;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── SERP fetch ────────────────────────────────────────────────────────────────

async function fetchSerpPosition(keyword: string, targetUrl: string, language: string, country: string) {
  const auth = dfsCreds();
  const res = await fetch(`${DATAFORSEO_BASE}/serp/google/organic/live/regular`, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword,
      language_code: language,
      location_code: countryToLocation(country),
      depth: 100,
    }]),
  });
  if (!res.ok) throw AppError.badRequest(`DataForSEO SERP error: ${res.status}`);
  const json = await res.json() as {
    tasks: Array<{
      result: Array<{
        items: Array<{ type: string; rank_absolute: number; url: string; title: string }>
      }>
    }>
  };

  const items = json.tasks[0]?.result[0]?.items ?? [];
  const targetBase = new URL(targetUrl).hostname;
  const match = items
    .filter(i => i.type === 'organic')
    .find(i => {
      try { return new URL(i.url).hostname === targetBase; } catch { return false; }
    });

  return match
    ? { position: match.rank_absolute, url: match.url, title: match.title, rawData: { items: items.slice(0, 10) } }
    : { position: null, url: null, title: null, rawData: { items: items.slice(0, 10) } };
}

// ── Tracking CRUD ─────────────────────────────────────────────────────────────

export async function addTrackedKeyword(orgId: string, input: {
  keyword: string;
  url: string;
  language?: string;
  country?: string;
}) {
  const [row] = await db
    .insert(seoRankTracking)
    .values({
      orgId,
      keyword: input.keyword,
      url: input.url,
      language: input.language ?? 'en',
      country: input.country ?? 'US',
    })
    .onConflictDoUpdate({
      target: [seoRankTracking.orgId, seoRankTracking.keyword, seoRankTracking.url, seoRankTracking.country],
      set: { active: true },
    })
    .returning();
  return row;
}

export async function removeTrackedKeyword(orgId: string, trackingId: string) {
  const [row] = await db
    .update(seoRankTracking)
    .set({ active: false })
    .where(and(eq(seoRankTracking.orgId, orgId), eq(seoRankTracking.id, trackingId)))
    .returning({ id: seoRankTracking.id });
  if (!row) throw AppError.notFound('Tracked keyword not found');
}

export async function listTrackedKeywords(orgId: string) {
  return db
    .select()
    .from(seoRankTracking)
    .where(and(eq(seoRankTracking.orgId, orgId), eq(seoRankTracking.active, true)));
}

// ── Snapshot fetching ─────────────────────────────────────────────────────────

export async function fetchRankSnapshot(trackingId: string) {
  const [tracker] = await db
    .select()
    .from(seoRankTracking)
    .where(eq(seoRankTracking.id, trackingId));
  if (!tracker) throw AppError.notFound('Tracked keyword not found');

  const today = todayStr();
  const serp = await fetchSerpPosition(tracker.keyword, tracker.url, tracker.language, tracker.country);

  const [row] = await db
    .insert(seoRankSnapshots)
    .values({
      orgId: tracker.orgId,
      trackingId,
      date: today,
      position: serp.position ?? undefined,
      url: serp.url ?? undefined,
      title: serp.title ?? undefined,
      rawData: serp.rawData,
    })
    .onConflictDoUpdate({
      target: [seoRankSnapshots.trackingId, seoRankSnapshots.date],
      set: {
        position: serp.position ?? undefined,
        url: serp.url ?? undefined,
        title: serp.title ?? undefined,
        rawData: serp.rawData,
      },
    })
    .returning();
  return row;
}

export async function fetchAllOrgRanks(orgId: string) {
  const trackers = await db
    .select()
    .from(seoRankTracking)
    .where(and(eq(seoRankTracking.orgId, orgId), eq(seoRankTracking.active, true)));

  const results = [];
  for (const t of trackers) {
    try {
      const snap = await fetchRankSnapshot(t.id);
      results.push({ trackingId: t.id, keyword: t.keyword, ...snap });
    } catch (err) {
      results.push({ trackingId: t.id, keyword: t.keyword, error: (err as Error).message });
    }
  }
  return results;
}

export async function getRankHistory(orgId: string, trackingId: string, days = 30) {
  return db
    .select()
    .from(seoRankSnapshots)
    .where(and(eq(seoRankSnapshots.orgId, orgId), eq(seoRankSnapshots.trackingId, trackingId)))
    .orderBy(desc(seoRankSnapshots.date))
    .limit(days);
}
