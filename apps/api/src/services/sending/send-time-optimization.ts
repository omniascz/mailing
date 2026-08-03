/**
 * Per-contact Send Time Optimization (STO).
 *
 * Analyzes a contact's historical email_events to find their "peak engagement
 * window" — the hour-of-day they most often open or click emails. The result
 * is used to delay campaign delivery until the contact's personal optimal hour.
 *
 * Algorithm:
 *   1. Aggregate open + click events per contact over the last N days.
 *   2. Score each hour 0-23: opens = 1pt, clicks = 3pt (clicks signal stronger intent).
 *   3. Return the top-scoring hour (UTC). Tie-break: earlier in day wins.
 *   4. If no history (< MIN_EVENTS), fall back to org-level peak.
 *   5. Confidence < 0.3 → return null (no recommendation, send immediately).
 *
 * Integration:
 *   - Campaign splitter calls `getContactSendHour(orgId, contactId)` before
 *     scheduling each job, delaying until the next occurrence of peak hour.
 *   - Org-level peak is cached in Redis (4h TTL) to avoid N+1 queries.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { redis } from '@forgemsg/shared/redis';

const LOOKBACK_DAYS = 90;
const MIN_EVENTS = 5;
const CACHE_TTL_SECONDS = 14400; // 4h

export interface StoResult {
  /** Optimal hour 0-23 (UTC), or null when confidence is too low. */
  peakHour: number | null;
  /** 0-1 confidence based on consistency and sample size. */
  confidence: number;
  /** Total scored events used in the calculation. */
  sampleSize: number;
}

// ─── Per-contact STO ─────────────────────────────────────────────────────────

export async function getContactSendHour(orgId: string, contactId: string): Promise<StoResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

  const rows = (await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      SUM(CASE WHEN event_type = 'click' THEN 3 ELSE 1 END)::int AS score
    FROM email_events
    WHERE org_id = ${orgId}
      AND contact_id = ${contactId}
      AND event_type IN ('open','click')
      AND is_bot IS NOT TRUE
      AND created_at >= ${since}
    GROUP BY 1
    ORDER BY 2 DESC
  `)) as unknown as { rows: Array<{ hour: number; score: number }> };

  const hourRows = rows.rows ?? [];
  return computeSto(hourRows);
}

// ─── Org-level fallback (cached) ─────────────────────────────────────────────

export async function getOrgPeakHour(orgId: string): Promise<StoResult> {
  const cacheKey = `sto:org:${orgId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as StoResult;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

  const rows = (await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      SUM(CASE WHEN event_type = 'click' THEN 3 ELSE 1 END)::int AS score
    FROM email_events
    WHERE org_id = ${orgId}
      AND event_type IN ('open','click')
      AND is_bot IS NOT TRUE
      AND created_at >= ${since}
    GROUP BY 1
    ORDER BY 2 DESC
  `)) as unknown as { rows: Array<{ hour: number; score: number }> };

  const result = computeSto(rows.rows ?? []);
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS).catch(() => {});
  return result;
}

// ─── Batch: best send hour for a list of contacts ────────────────────────────

export interface ContactSendTime {
  contactId: string;
  peakHour: number | null;
  confidence: number;
}

export async function getBatchSendHours(
  orgId: string,
  contactIds: string[],
): Promise<Map<string, ContactSendTime>> {
  if (contactIds.length === 0) return new Map();

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

  const rows = (await db.execute(sql`
    SELECT
      contact_id,
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      SUM(CASE WHEN event_type = 'click' THEN 3 ELSE 1 END)::int AS score
    FROM email_events
    WHERE org_id = ${orgId}
      AND contact_id = ANY(${contactIds}::uuid[])
      AND event_type IN ('open','click')
      AND is_bot IS NOT TRUE
      AND created_at >= ${since}
    GROUP BY contact_id, hour
    ORDER BY contact_id, score DESC
  `)) as unknown as { rows: Array<{ contact_id: string; hour: number; score: number }> };

  // Group by contact
  const byContact = new Map<string, Array<{ hour: number; score: number }>>();
  for (const r of rows.rows ?? []) {
    if (!byContact.has(r.contact_id)) byContact.set(r.contact_id, []);
    byContact.get(r.contact_id)!.push({ hour: r.hour, score: r.score });
  }

  // Get org fallback
  const orgFallback = await getOrgPeakHour(orgId);

  const result = new Map<string, ContactSendTime>();
  for (const contactId of contactIds) {
    const hourRows = byContact.get(contactId) ?? [];
    const sto = computeSto(hourRows);
    result.set(contactId, {
      contactId,
      // Fall back to org peak if contact has too little data
      peakHour: sto.peakHour ?? orgFallback.peakHour,
      confidence: sto.confidence > 0 ? sto.confidence : orgFallback.confidence * 0.5,
    });
  }
  return result;
}

// ─── Next occurrence of a target hour (UTC) ──────────────────────────────────

/**
 * Returns the next Date at which the clock (UTC) will show `targetHour:00`.
 * If targetHour is null or confidence < threshold, returns now (send immediately).
 */
export function nextSendWindow(
  targetHour: number | null,
  confidence: number,
  minConfidence = 0.25,
): Date {
  if (targetHour === null || confidence < minConfidence) return new Date();

  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCHours(targetHour, 0, 0, 0);
  if (candidate <= now) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  // Don't delay more than 23 hours — cap to avoid excessive latency
  const diffMs = candidate.getTime() - now.getTime();
  if (diffMs > 23 * 3600_000) return new Date();
  return candidate;
}

// ─── Core computation (pure, testable) ───────────────────────────────────────

function computeSto(hourRows: Array<{ hour: number; score: number }>): StoResult {
  if (hourRows.length === 0) return { peakHour: null, confidence: 0, sampleSize: 0 };

  const totalScore = hourRows.reduce((acc, r) => acc + r.score, 0);
  if (totalScore < MIN_EVENTS) return { peakHour: null, confidence: 0, sampleSize: totalScore };

  // Best hour = first row (already sorted DESC by score in SQL)
  const best = hourRows[0]!;

  // Confidence = concentration × sample saturation.
  // concentration: how much the best hour dominates (0 = flat, 1 = all in one hour).
  //   A flat 24-hour distribution → 1/24 ≈ 0.04 → low confidence even with many events.
  // sampleFactor: how much data we have (saturates at 200 weighted events).
  //   A single click (score=3) → 3/200 = 0.015 → near-zero confidence regardless of concentration.
  // Both factors must be high to produce an actionable recommendation.
  const concentration = best.score / totalScore;
  const sampleFactor = Math.min(1, totalScore / 200);
  const confidence = concentration * sampleFactor;

  return {
    peakHour: best.hour,
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: totalScore,
  };
}
