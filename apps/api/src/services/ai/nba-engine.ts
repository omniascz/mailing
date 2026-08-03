/**
 * Next-Best-Action (NBA) scoring engine.
 * Computes optimal channel + timing for each contact based on recency,
 * engagement patterns, intent signals, and channel fatigue.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { nbaScores, type NbaBreakdown } from '../../db/schema/nba-scores.js';
import { contacts } from '../../db/schema/index.js';
import { pickBestChannel } from './nba-pure.js';
import { getPrediction } from '../send-optimization/per-contact-sto.js';

const STO_MIN_CONFIDENCE = 0.3; // below this, fall back to the engagement heuristic

export async function computeNbaScore(
  orgId: string,
  contactId: string,
): Promise<{ channel: string; score: number; breakdown: NbaBreakdown; bestSendHour: number }> {
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const [emailStats] = await db
    .select({
      opens: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'open')`,
      clicks: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'click')`,
      bounces: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'bounce')`,
      complaints: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'complaint')`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.contactId, contactId),
        gte(emailEvents.createdAt, since30d),
      ),
    );

  const opens = Number(emailStats?.opens ?? 0);
  const clicks = Number(emailStats?.clicks ?? 0);
  const bounces = Number(emailStats?.bounces ?? 0);
  const complaints = Number(emailStats?.complaints ?? 0);

  const [contact] = await db
    .select({ customFields: contacts.customFields })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  const cf = (contact?.customFields ?? {}) as Record<string, unknown>;

  const recencyScore = Math.min(100, opens * 15 + clicks * 25);
  const engagementScore = Math.min(100, (opens + clicks * 2) * 10);
  const intentScore = cf['intent_score'] ? Math.min(100, Number(cf['intent_score'])) : 30;
  const fatiguePenalty = Math.min(50, bounces * 20 + complaints * 30);

  const emailScore = Math.max(
    0,
    Math.min(100, recencyScore * 0.3 + engagementScore * 0.4 + intentScore * 0.3 - fatiguePenalty),
  );

  const channelScores: NbaBreakdown['channelScores'] = {
    email: emailScore,
    sms: cf['sms_opted_in'] ? emailScore * 0.7 : 0,
    push: cf['push_subscribed'] ? emailScore * 0.5 : 0,
    whatsapp: cf['wa_opted_in'] ? emailScore * 0.6 : 0,
  };

  // Find best channel by weighted score (consistent comparison + reported score).
  const { channel: bestChannel, score: bestScore } = pickBestChannel(channelScores);

  // Best hour: prefer the contact's own empirical-Bayes STO prediction; fall
  // back to a coarse engagement heuristic when there isn't enough open history.
  const stoPrediction = await getPrediction(orgId, contactId).catch(() => null);
  const bestSendHour =
    stoPrediction && stoPrediction.confidence >= STO_MIN_CONFIDENCE
      ? stoPrediction.bestHourUtc
      : clicks > opens / 2
        ? 14
        : 10;

  const breakdown: NbaBreakdown = {
    recencyScore,
    engagementScore,
    intentScore,
    fatiguePenalty,
    channelScores,
  };

  return { channel: bestChannel, score: bestScore, breakdown, bestSendHour };
}

export async function upsertNbaScore(orgId: string, contactId: string): Promise<void> {
  const { channel, score, breakdown, bestSendHour } = await computeNbaScore(orgId, contactId);

  await db
    .delete(nbaScores)
    .where(and(eq(nbaScores.orgId, orgId), eq(nbaScores.contactId, contactId)));

  await db.insert(nbaScores).values({
    orgId,
    contactId,
    recommendedChannel: channel,
    score: String(score.toFixed(2)),
    breakdown,
    bestSendHour: String(bestSendHour),
    expiresAt: new Date(Date.now() + 24 * 3600_000),
  });
}

export async function getNbaScore(orgId: string, contactId: string) {
  const [row] = await db
    .select()
    .from(nbaScores)
    .where(and(eq(nbaScores.orgId, orgId), eq(nbaScores.contactId, contactId)))
    .orderBy(desc(nbaScores.computedAt))
    .limit(1);
  return row ?? null;
}

export async function batchComputeNbaScores(orgId: string, contactIds: string[]): Promise<number> {
  let done = 0;
  for (const cid of contactIds.slice(0, 200)) {
    try {
      await upsertNbaScore(orgId, cid);
      done++;
    } catch {
      /* skip */
    }
  }
  return done;
}
