/**
 * Engagement Score orchestrator (§9 P1).
 *
 * Pulls 90-day windows of activity from email_events, sms_send_log +
 * sms_inbound, calls, push_send_log, site_page_views + site_events, and
 * the commerce aggregates already cached on contact_engagement
 * (totalOrders, lastOrderAt). Hands the facts to the pure scorer and
 * persists the result.
 *
 * Wires into the daily-run orchestrator alongside RFM, predictive
 * segmentation, and Channel Scoring so every nightly refresh produces a
 * coherent set of derived columns.
 */

import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contactEngagement,
  emailEvents,
  smsSendLog,
  smsInbound,
  calls,
  pushSendLog,
  sitePageViews,
  siteEvents,
} from '../../db/schema/index.js';
import { emptyFacts, scoreEngagement, type EngagementBand, type EngagementFacts } from './pure.js';

const SCORE_WINDOW_DAYS = 90;

export interface ContactEngagementResult {
  contactId: string;
  score: number | null;
  band: EngagementBand | null;
  scoredAt: Date | null;
}

export async function getContactEngagementScore(
  contactId: string,
): Promise<ContactEngagementResult | null> {
  const [row] = await db
    .select({
      contactId: contactEngagement.contactId,
      score: contactEngagement.engagementScore,
      band: contactEngagement.engagementBand,
      scoredAt: contactEngagement.engagementScoredAt,
    })
    .from(contactEngagement)
    .where(eq(contactEngagement.contactId, contactId))
    .limit(1);
  if (!row) return null;
  return {
    contactId: row.contactId,
    score: row.score,
    band: row.band as EngagementBand | null,
    scoredAt: row.scoredAt,
  };
}

export async function refreshOrgEngagement(orgId: string): Promise<{ scored: number }> {
  // Ensure every contact has an engagement row before we score (mirrors
  // RFM/predictive bootstrap).
  await db.execute(sql`
    INSERT INTO contact_engagement (contact_id, org_id)
    SELECT id, org_id FROM contacts WHERE org_id = ${orgId}::uuid
    ON CONFLICT (contact_id) DO NOTHING
  `);

  const engagementRows = await db
    .select({
      contactId: contactEngagement.contactId,
      lastOrderAt: contactEngagement.lastOrderAt,
      totalOrders: contactEngagement.totalOrders,
    })
    .from(contactEngagement)
    .where(eq(contactEngagement.orgId, orgId));

  if (engagementRows.length === 0) return { scored: 0 };

  const contactIds = engagementRows.map((r) => r.contactId);
  const facts = await collectFacts(orgId, contactIds);

  const now = new Date();
  let scored = 0;
  for (const row of engagementRows) {
    const f = facts.get(row.contactId) ?? emptyFacts();
    // Splice commerce facts from contact_engagement aggregates the email
    // pipeline already maintains.
    f.totalOrders = row.totalOrders;
    f.daysSinceLastOrder = row.lastOrderAt
      ? Math.max(0, (now.getTime() - row.lastOrderAt.getTime()) / 86_400_000)
      : null;

    const result = scoreEngagement(f);
    await db
      .update(contactEngagement)
      .set({
        engagementScore: result.score,
        engagementBand: result.band,
        engagementScoredAt: now,
      })
      .where(eq(contactEngagement.contactId, row.contactId));
    scored++;
  }
  return { scored };
}

export async function refreshAllOrgsEngagement(): Promise<{
  orgs: number;
  scored: number;
  errors: number;
}> {
  const rows = (await db.execute<{ org_id: string }>(sql`
    SELECT DISTINCT org_id FROM contact_engagement
  `)) as unknown as Array<{ org_id: string }>;
  let scored = 0;
  let errors = 0;
  for (const { org_id } of rows) {
    try {
      const r = await refreshOrgEngagement(org_id);
      scored += r.scored;
    } catch {
      errors++;
    }
  }
  return { orgs: rows.length, scored, errors };
}

/** Distribution of engagement bands across an org — drives the dashboard chip. */
export async function engagementBandDistribution(
  orgId: string,
): Promise<Array<{ band: EngagementBand; count: number }>> {
  const rows = (await db.execute<{ band: string; count: string }>(sql`
    SELECT engagement_band AS band, COUNT(*)::text AS count
    FROM contact_engagement
    WHERE org_id = ${orgId}::uuid AND engagement_band IS NOT NULL
    GROUP BY engagement_band
  `)) as unknown as Array<{ band: string; count: string }>;
  return rows.map((r) => ({ band: r.band as EngagementBand, count: Number(r.count) }));
}

// ─── Fact collection ──────────────────────────────────────────────────────

const CART_EVENT_NAMES = ['cart_abandoned', 'cart_added', 'checkout_started'];

async function collectFacts(
  orgId: string,
  contactIds: string[],
): Promise<Map<string, EngagementFacts>> {
  const out = new Map<string, EngagementFacts>();
  if (contactIds.length === 0) return out;

  const since = new Date(Date.now() - SCORE_WINDOW_DAYS * 86_400_000);
  const ensure = (id: string): EngagementFacts => {
    let f = out.get(id);
    if (!f) {
      f = emptyFacts();
      out.set(id, f);
    }
    return f;
  };

  const now = Date.now();
  const days = (d: Date | null) => (d ? (now - d.getTime()) / 86_400_000 : null);

  // 1. Email — sends/opens/clicks + last engagement
  const emailRows = (await db
    .select({
      contactId: emailEvents.contactId,
      sends: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'send')::text`,
      opens: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'open')::text`,
      clicks: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'click')::text`,
      lastAt: sql<Date | null>`max(${emailEvents.createdAt}) filter (where ${emailEvents.eventType} in ('open','click'))`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        inArray(emailEvents.contactId, contactIds),
        gte(emailEvents.createdAt, since),
      ),
    )
    .groupBy(emailEvents.contactId)) as unknown as Array<{
    contactId: string | null;
    sends: string;
    opens: string;
    clicks: string;
    lastAt: Date | null;
  }>;
  for (const r of emailRows) {
    if (!r.contactId) continue;
    const f = ensure(r.contactId);
    f.emailSends = Number(r.sends);
    f.emailOpens = Number(r.opens);
    f.emailClicks = Number(r.clicks);
    f.daysSinceLastEmailEngagement = days(r.lastAt ? new Date(r.lastAt) : null);
  }

  // 2. SMS — sends from log, replies from inbound
  const smsSendRows = (await db
    .select({
      contactId: smsSendLog.contactId,
      sends: sql<string>`count(*)::text`,
    })
    .from(smsSendLog)
    .where(
      and(
        eq(smsSendLog.orgId, orgId),
        inArray(smsSendLog.contactId, contactIds),
        gte(smsSendLog.createdAt, since),
      ),
    )
    .groupBy(smsSendLog.contactId)) as unknown as Array<{
    contactId: string | null;
    sends: string;
  }>;
  for (const r of smsSendRows) {
    if (!r.contactId) continue;
    ensure(r.contactId).smsSends = Number(r.sends);
  }

  const smsReplyRows = (await db
    .select({
      contactId: smsInbound.contactId,
      replies: sql<string>`count(*)::text`,
      lastAt: sql<Date | null>`max(${smsInbound.createdAt})`,
    })
    .from(smsInbound)
    .where(
      and(
        eq(smsInbound.orgId, orgId),
        inArray(smsInbound.contactId, contactIds),
        gte(smsInbound.createdAt, since),
      ),
    )
    .groupBy(smsInbound.contactId)) as unknown as Array<{
    contactId: string | null;
    replies: string;
    lastAt: Date | null;
  }>;
  for (const r of smsReplyRows) {
    if (!r.contactId) continue;
    const f = ensure(r.contactId);
    f.smsReplies = Number(r.replies);
    f.daysSinceLastSmsReply = days(r.lastAt ? new Date(r.lastAt) : null);
  }

  // 3. Voice — calls table; status='completed' with durationSeconds > 5
  const voiceRows = (await db
    .select({
      contactId: calls.contactId,
      total: sql<string>`count(*)::text`,
      answered: sql<string>`count(*) filter (where ${calls.status} = 'completed' and ${calls.durationSeconds} > 5)::text`,
      lastAt: sql<Date | null>`max(${calls.createdAt}) filter (where ${calls.status} = 'completed')`,
    })
    .from(calls)
    .where(
      and(
        eq(calls.orgId, orgId),
        inArray(calls.contactId, contactIds),
        gte(calls.createdAt, since),
      ),
    )
    .groupBy(calls.contactId)) as unknown as Array<{
    contactId: string;
    total: string;
    answered: string;
    lastAt: Date | null;
  }>;
  for (const r of voiceRows) {
    const f = ensure(r.contactId);
    f.voiceCalls = Number(r.total);
    f.voiceAnswered = Number(r.answered);
    f.daysSinceLastVoiceAnswer = days(r.lastAt ? new Date(r.lastAt) : null);
  }

  // 4. Push — sends + clicks
  const pushRows = (await db
    .select({
      contactId: pushSendLog.contactId,
      sends: sql<string>`count(*)::text`,
      clicks: sql<string>`count(*) filter (where ${pushSendLog.clickedAt} is not null)::text`,
      lastAt: sql<Date | null>`max(${pushSendLog.clickedAt})`,
    })
    .from(pushSendLog)
    .where(
      and(
        eq(pushSendLog.orgId, orgId),
        inArray(pushSendLog.contactId, contactIds),
        gte(pushSendLog.createdAt, since),
      ),
    )
    .groupBy(pushSendLog.contactId)) as unknown as Array<{
    contactId: string | null;
    sends: string;
    clicks: string;
    lastAt: Date | null;
  }>;
  for (const r of pushRows) {
    if (!r.contactId) continue;
    const f = ensure(r.contactId);
    f.pushSends = Number(r.sends);
    f.pushClicks = Number(r.clicks);
    f.daysSinceLastPushClick = days(r.lastAt ? new Date(r.lastAt) : null);
  }

  // 5. Web — page views split anonymous vs identified
  const webRows = (await db
    .select({
      contactId: sitePageViews.contactId,
      views: sql<string>`count(*)::text`,
      lastAt: sql<Date | null>`max(${sitePageViews.occurredAt})`,
    })
    .from(sitePageViews)
    .where(
      and(
        eq(sitePageViews.orgId, orgId),
        inArray(sitePageViews.contactId, contactIds),
        gte(sitePageViews.occurredAt, since),
      ),
    )
    .groupBy(sitePageViews.contactId)) as unknown as Array<{
    contactId: string | null;
    views: string;
    lastAt: Date | null;
  }>;
  for (const r of webRows) {
    if (!r.contactId) continue;
    const f = ensure(r.contactId);
    // Anything resolved to a contact counts as identified.
    f.identifiedPageViews = Number(r.views);
    f.daysSinceLastPageView = days(r.lastAt ? new Date(r.lastAt) : null);
  }

  // 6. Cart events from site_events (anonymous + identified)
  const cartRows = (await db
    .select({
      contactId: siteEvents.contactId,
      count: sql<string>`count(*)::text`,
    })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.orgId, orgId),
        inArray(siteEvents.contactId, contactIds),
        inArray(siteEvents.eventName, CART_EVENT_NAMES),
        gte(siteEvents.occurredAt, since),
      ),
    )
    .groupBy(siteEvents.contactId)) as unknown as Array<{
    contactId: string | null;
    count: string;
  }>;
  for (const r of cartRows) {
    if (!r.contactId) continue;
    ensure(r.contactId).totalCartEvents = Number(r.count);
  }

  return out;
}
