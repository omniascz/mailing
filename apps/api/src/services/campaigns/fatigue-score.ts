/**
 * Cross-campaign contact fatigue score.
 * Measures total email pressure on each contact across ALL campaigns.
 * The Email Pressure Index (EPI) prevents over-mailing beyond Smart Sending.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';

export interface FatigueScore {
  contactId: string;
  epi: number;           // 0 (rested) – 100 (exhausted)
  tier: 'rested' | 'engaged' | 'tired' | 'fatigued' | 'exhausted';
  emailsSentLast7d: number;
  emailsSentLast14d: number;
  emailsSentLast30d: number;
  openRateLast30d: number;
  trendDelta: number;    // open rate change vs prior period (negative = declining)
  recommendedSuppressUntil: Date | null; // null = OK to send now
}

function scoreTier(epi: number): FatigueScore['tier'] {
  if (epi >= 80) return 'exhausted';
  if (epi >= 60) return 'fatigued';
  if (epi >= 40) return 'tired';
  if (epi >= 20) return 'engaged';
  return 'rested';
}

export async function computeFatigueScore(
  orgId: string,
  contactId: string,
): Promise<FatigueScore> {
  const now = Date.now();
  const d7  = new Date(now - 7  * 86400_000);
  const d14 = new Date(now - 14 * 86400_000);
  const d30 = new Date(now - 30 * 86400_000);
  const d60 = new Date(now - 60 * 86400_000);

  const [all] = await db.select({
    sent7:    sql<number>`count(*) filter (where event_type = 'deliver' and created_at >= ${d7.toISOString()})::int`,
    sent14:   sql<number>`count(*) filter (where event_type = 'deliver' and created_at >= ${d14.toISOString()})::int`,
    sent30:   sql<number>`count(*) filter (where event_type = 'deliver' and created_at >= ${d30.toISOString()})::int`,
    opens30:  sql<number>`count(*) filter (where event_type = 'open'      and created_at >= ${d30.toISOString()})::int`,
    sentPrev: sql<number>`count(*) filter (where event_type = 'deliver' and created_at >= ${d60.toISOString()} and created_at < ${d30.toISOString()})::int`,
    opensPrev:sql<number>`count(*) filter (where event_type = 'open'      and created_at >= ${d60.toISOString()} and created_at < ${d30.toISOString()})::int`,
  }).from(emailEvents).where(and(
    eq(emailEvents.orgId, orgId),
    eq(emailEvents.contactId, contactId),
    gte(emailEvents.createdAt, d60),
  ));

  const s7  = Number(all?.sent7  ?? 0);
  const s14 = Number(all?.sent14 ?? 0);
  const s30 = Number(all?.sent30 ?? 0);
  const o30 = Number(all?.opens30 ?? 0);
  const sp  = Number(all?.sentPrev ?? 0);
  const op  = Number(all?.opensPrev ?? 0);

  const openRate30 = s30 > 0 ? o30 / s30 : 0;
  const openRatePrev = sp > 0 ? op / sp : 0;
  const trendDelta = openRate30 - openRatePrev;

  // Email Pressure Index (0-100)
  let epi = 0;
  epi += Math.min(30, s7  * 6);   // 5+ emails in 7d → max pressure contribution
  epi += Math.min(25, s14 * 3);
  epi += Math.min(20, s30 * 1);
  if (openRate30 < 0.05 && s30 > 2) epi += 15;
  else if (openRate30 < 0.1) epi += 5;
  if (trendDelta < -0.15) epi += 10;
  epi = Math.min(100, Math.round(epi));

  // Suppress recommendation
  let suppressUntil: Date | null = null;
  if (epi >= 80) suppressUntil = new Date(now + 14 * 86400_000);
  else if (epi >= 60) suppressUntil = new Date(now + 7  * 86400_000);

  return {
    contactId,
    epi,
    tier: scoreTier(epi),
    emailsSentLast7d:  s7,
    emailsSentLast14d: s14,
    emailsSentLast30d: s30,
    openRateLast30d:   openRate30,
    trendDelta,
    recommendedSuppressUntil: suppressUntil,
  };
}

/** Batch compute EPI for multiple contacts. */
export async function batchFatigueScores(
  orgId: string,
  contactIds: string[],
): Promise<FatigueScore[]> {
  return Promise.all(contactIds.map((id) => computeFatigueScore(orgId, id)));
}

/** Return the most fatigued contacts org-wide (top N). */
export async function getMostFatiguedContacts(
  orgId: string,
  minEpi = 60,
  limit = 200,
): Promise<Array<{ contactId: string; sent7d: number; openRate: number }>> {
  const d30 = new Date(Date.now() - 30 * 86400_000);
  const d7  = new Date(Date.now() - 7  * 86400_000);

  const rows = await db.select({
    contactId: emailEvents.contactId,
    sent30: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
    sent7:  sql<number>`count(*) filter (where event_type = 'deliver' and created_at >= ${d7.toISOString()})::int`,
    opens30:sql<number>`count(*) filter (where event_type = 'open')::int`,
  }).from(emailEvents).where(and(
    eq(emailEvents.orgId, orgId),
    gte(emailEvents.createdAt, d30),
  )).groupBy(emailEvents.contactId).limit(limit * 3);

  return rows
    .map((r) => {
      const s30 = Number(r.sent30);
      const openRate = s30 > 0 ? Number(r.opens30) / s30 : 0;
      const roughEpi = Math.min(100, Number(r.sent7) * 6 + (openRate < 0.05 ? 15 : 0));
      return { contactId: r.contactId, sent7d: Number(r.sent7), openRate, roughEpi };
    })
    .filter((r) => r.roughEpi >= minEpi)
    .sort((a, b) => b.roughEpi - a.roughEpi)
    .slice(0, limit)

    .filter((r) => r.contactId !== null)
    .map(({ contactId, sent7d, openRate }) => ({ contactId: contactId as string, sent7d, openRate }));
}
