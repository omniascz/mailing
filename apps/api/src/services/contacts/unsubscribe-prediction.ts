/**
 * Predictive unsubscribe prevention.
 * Detects contacts at high risk of unsubscribing / going dormant before they do,
 * so you can trigger a proactive win-back or suppression.
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';

export interface UnsubscribeRisk {
  contactId: string;
  riskScore: number;   // 0-1; ≥0.7 = high risk
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  signals: {
    daysSinceLastOpen: number | null;
    openRateLast30d: number;
    openRatePrev30d: number;
    trendDelta: number;
    clickRateLast30d: number;
    campaignsSentLast30d: number;
    unsubscribedBefore: boolean;
  };
}

/** Compute at-risk score for a single contact based on recent engagement. */
export async function computeUnsubscribeRisk(
  orgId: string,
  contactId: string,
): Promise<UnsubscribeRisk> {
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400_000);
  const d60 = new Date(now - 60 * 86400_000);

  const [last30] = await db.select({
    sent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
    opens: sql<number>`count(*) filter (where event_type = 'open')::int`,
    clicks: sql<number>`count(*) filter (where event_type = 'click')::int`,
    unsubs: sql<number>`count(*) filter (where event_type = 'unsubscribe')::int`,
    lastOpen: sql<string | null>`max(created_at) filter (where event_type = 'open')`,
  }).from(emailEvents).where(and(
    eq(emailEvents.orgId, orgId),
    eq(emailEvents.contactId, contactId),
    gte(emailEvents.createdAt, d30),
  ));

  const [prev30] = await db.select({
    sent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
    opens: sql<number>`count(*) filter (where event_type = 'open')::int`,
  }).from(emailEvents).where(and(
    eq(emailEvents.orgId, orgId),
    eq(emailEvents.contactId, contactId),
    gte(emailEvents.createdAt, d60),
    lt(emailEvents.createdAt, d30),
  ));

  const sent30 = Number(last30?.sent ?? 0);
  const opens30 = Number(last30?.opens ?? 0);
  const clicks30 = Number(last30?.clicks ?? 0);
  const sentPrev = Number(prev30?.sent ?? 0);
  const opensPrev = Number(prev30?.opens ?? 0);
  const unsubBefore = Number(last30?.unsubs ?? 0) > 0;

  const openRate30 = sent30 > 0 ? opens30 / sent30 : 0;
  const openRatePrev = sentPrev > 0 ? opensPrev / sentPrev : 0;
  const trendDelta = openRate30 - openRatePrev;
  const clickRate30 = opens30 > 0 ? clicks30 / opens30 : 0;

  const lastOpenDate = last30?.lastOpen ? new Date(last30.lastOpen) : null;
  const daysSinceLastOpen = lastOpenDate ? Math.floor((now - lastOpenDate.getTime()) / 86400_000) : null;

  // Score: weighted combination of signals
  let score = 0;
  if (daysSinceLastOpen === null || daysSinceLastOpen > 60) score += 0.35;
  else if (daysSinceLastOpen > 30) score += 0.2;
  else if (daysSinceLastOpen > 14) score += 0.05;

  if (trendDelta < -0.2) score += 0.25;
  else if (trendDelta < -0.1) score += 0.1;

  if (openRate30 < 0.05 && sent30 > 2) score += 0.2;
  else if (openRate30 < 0.1) score += 0.1;

  if (clickRate30 < 0.01 && sent30 > 2) score += 0.1;
  if (sent30 > 6) score += 0.1; // over-mailed

  score = Math.min(1, score);

  const riskTier: UnsubscribeRisk['riskTier'] =
    score >= 0.8 ? 'critical' :
    score >= 0.6 ? 'high' :
    score >= 0.35 ? 'medium' : 'low';

  return {
    contactId,
    riskScore: score,
    riskTier,
    signals: {
      daysSinceLastOpen,
      openRateLast30d: openRate30,
      openRatePrev30d: openRatePrev,
      trendDelta,
      clickRateLast30d: clickRate30,
      campaignsSentLast30d: sent30,
      unsubscribedBefore: unsubBefore,
    },
  };
}

/** Return all high/critical risk contacts for an org (paginated). */
export async function getAtRiskContacts(
  orgId: string,
  minRiskScore = 0.6,
  limit = 200,
): Promise<Array<{ contactId: string; daysSinceOpen: number | null }>> {
  const d30 = new Date(Date.now() - 30 * 86400_000);

  const rows = await db
    .select({
      contactId: emailEvents.contactId,
      sent: sql<number>`count(*) filter (where event_type = 'deliver')::int`,
      opens: sql<number>`count(*) filter (where event_type = 'open')::int`,
      lastOpen: sql<string | null>`max(created_at) filter (where event_type = 'open')`,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), gte(emailEvents.createdAt, d30)))
    .groupBy(emailEvents.contactId)
    .limit(limit * 5); // oversample, filter below

  const results: Array<{ contactId: string; daysSinceOpen: number | null }> = [];
  for (const row of rows) {
    const sent = Number(row.sent);
    const opens = Number(row.opens);
    if (sent < 1) continue;
    const openRate = opens / sent;
    const daysSinceOpen = row.lastOpen
      ? Math.floor((Date.now() - new Date(row.lastOpen).getTime()) / 86400_000)
      : null;
    const roughScore = (openRate < 0.1 ? 0.3 : 0) + (daysSinceOpen !== null && daysSinceOpen > 21 ? 0.3 : 0) + (sent > 5 ? 0.1 : 0);
    if (roughScore >= minRiskScore * 0.7 && row.contactId) {
      results.push({ contactId: row.contactId, daysSinceOpen });
    }
    if (results.length >= limit) break;
  }
  return results;
}
