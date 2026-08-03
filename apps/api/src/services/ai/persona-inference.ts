import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactPersonas, type PersonaSignals } from '../../db/schema/contact-personas.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { revenueEvents } from '../../db/schema/revenue.js';
import { callClaude } from '../../lib/ai-client.js';

type PersonaType = (typeof contactPersonas.$inferInsert)['persona'];

interface RawSignals {
  totalSent: number;
  opens: number;
  clicks: number;
  complaints: number;
  purchaseCount: number;
  totalRevenue: number;
  discountPurchases: number;
  daysSinceLastOpen: number | null;
  daysSinceLastClick: number | null;
  daysSinceFirstEvent: number;
}

async function collectSignals(orgId: string, contactId: string): Promise<RawSignals> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [evtRow] = await db
    .select({
      totalSent: sql<number>`count(*)::int`,
      opens: sql<number>`count(*) filter (where event_type = 'open')::int`,
      clicks: sql<number>`count(*) filter (where event_type = 'click')::int`,
      complaints: sql<number>`count(*) filter (where event_type = 'complaint')::int`,
      daysSinceLastOpen: sql<
        number | null
      >`extract(day from now() - max(created_at) filter (where event_type = 'open'))::int`,
      daysSinceLastClick: sql<
        number | null
      >`extract(day from now() - max(created_at) filter (where event_type = 'click'))::int`,
      daysSinceFirstEvent: sql<number>`extract(day from now() - min(created_at))::int`,
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.contactId, contactId),
        gte(emailEvents.createdAt, since),
      ),
    );

  const [revRow] = await db
    .select({
      purchaseCount: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(amount::numeric), 0)`,
      discountPurchases: sql<number>`count(*) filter (where metadata->>'coupon_used' = 'true')::int`,
    })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), eq(revenueEvents.contactId, contactId)));

  return {
    totalSent: Number(evtRow?.totalSent ?? 0),
    opens: Number(evtRow?.opens ?? 0),
    clicks: Number(evtRow?.clicks ?? 0),
    complaints: Number(evtRow?.complaints ?? 0),
    purchaseCount: Number(revRow?.purchaseCount ?? 0),
    totalRevenue: Number(revRow?.totalRevenue ?? 0),
    discountPurchases: Number(revRow?.discountPurchases ?? 0),
    daysSinceLastOpen: evtRow?.daysSinceLastOpen ?? null,
    daysSinceLastClick: evtRow?.daysSinceLastClick ?? null,
    daysSinceFirstEvent: Number(evtRow?.daysSinceFirstEvent ?? 0),
  };
}

function buildSignals(raw: RawSignals): PersonaSignals {
  const avgOpenRate = raw.totalSent > 0 ? raw.opens / raw.totalSent : 0;
  const avgClickRate = raw.opens > 0 ? raw.clicks / raw.opens : 0;
  const discountSensitivity = raw.purchaseCount > 0 ? raw.discountPurchases / raw.purchaseCount : 0;
  const avgOrderValue = raw.purchaseCount > 0 ? raw.totalRevenue / raw.purchaseCount : 0;

  let engagementTrend: PersonaSignals['engagementTrend'] = 'stable';
  if (raw.daysSinceLastOpen !== null && raw.daysSinceLastOpen > 45) engagementTrend = 'declining';
  else if (avgOpenRate > 0.4) engagementTrend = 'rising';

  return {
    avgOpenRate,
    avgClickRate,
    purchaseFrequency: raw.purchaseCount,
    avgOrderValue,
    discountSensitivity,
    engagementTrend,
    preferredChannel: 'email',
    bestSendDay: 'tuesday',
    bestSendHour: 10,
  };
}

function heuristicPersona(raw: RawSignals, signals: PersonaSignals): PersonaType {
  if (raw.daysSinceFirstEvent < 30) return 'new_subscriber';
  if (raw.daysSinceLastOpen !== null && raw.daysSinceLastOpen > 90) return 'dormant';
  if (raw.complaints > 0) return 'complainer';
  if (signals.avgOpenRate > 0.5 && raw.purchaseCount > 5 && signals.avgOrderValue > 100)
    return 'vip';
  if (
    signals.engagementTrend === 'declining' &&
    raw.daysSinceLastOpen !== null &&
    raw.daysSinceLastOpen > 30
  )
    return 'at_risk';
  if (signals.discountSensitivity > 0.7) return 'deal_hunter';
  if (signals.avgOpenRate > 0.45 && signals.avgClickRate > 0.3 && raw.purchaseCount > 3)
    return 'champion';
  if (raw.purchaseCount > 3 && signals.avgOpenRate > 0.3) return 'loyal';
  if (signals.avgOpenRate > 0.3 && raw.purchaseCount === 0) return 'window_shopper';
  return 'seasonal';
}

export async function inferPersona(
  orgId: string,
  contactId: string,
  useAi = true,
): Promise<{
  persona: PersonaType;
  confidence: number;
  signals: PersonaSignals;
  reasoning?: string;
}> {
  const raw = await collectSignals(orgId, contactId);
  const signals = buildSignals(raw);
  const heuristic = heuristicPersona(raw, signals);

  if (!useAi) {
    return { persona: heuristic, confidence: 0.65, signals };
  }

  const result = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    feature: 'other',
    tenantId: orgId,
    system: `You are a behavioral segmentation AI. Given engagement metrics for an email subscriber, classify them into exactly one persona type and explain why in 1 sentence.

Persona types:
- champion: high engagement, brand advocate, buys premium
- loyal: regular buyer, consistent engagement
- deal_hunter: price-sensitive, buys mostly on discount
- window_shopper: opens often but rarely clicks or buys
- seasonal: engagement spikes around holidays/promotions
- at_risk: previously engaged, now declining
- dormant: no meaningful engagement for 90+ days
- new_subscriber: subscribed < 30 days ago
- vip: top revenue contributor (high AOV + frequency)
- complainer: has marked as spam or complained

Respond as JSON: { "persona": "<type>", "confidence": 0.0-1.0, "reasoning": "<1 sentence>" }`,
    user: JSON.stringify({
      openRate: `${(signals.avgOpenRate * 100).toFixed(1)}%`,
      clickToOpenRate: `${(signals.avgClickRate * 100).toFixed(1)}%`,
      purchases90d: raw.purchaseCount,
      avgOrderValue: `$${signals.avgOrderValue.toFixed(2)}`,
      discountSensitivity: `${(signals.discountSensitivity * 100).toFixed(0)}%`,
      daysSinceLastOpen: raw.daysSinceLastOpen ?? 'never',
      complaints: raw.complaints,
      daysSinceSubscribed: raw.daysSinceFirstEvent,
      engagementTrend: signals.engagementTrend,
    }),
    maxTokens: 256,
  });

  try {
    const parsed = JSON.parse(result.text) as {
      persona: PersonaType;
      confidence: number;
      reasoning: string;
    };
    return {
      persona: parsed.persona,
      confidence: parsed.confidence,
      signals,
      reasoning: parsed.reasoning,
    };
  } catch {
    return { persona: heuristic, confidence: 0.65, signals };
  }
}

export async function upsertPersona(orgId: string, contactId: string): Promise<void> {
  const { persona, confidence, signals, reasoning } = await inferPersona(orgId, contactId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db
    .delete(contactPersonas)
    .where(and(eq(contactPersonas.orgId, orgId), eq(contactPersonas.contactId, contactId)));

  await db.insert(contactPersonas).values({
    orgId,
    contactId,
    persona,
    confidence: String(confidence),
    signals,
    aiReasoning: reasoning,
    expiresAt,
  });
}

export async function getPersona(orgId: string, contactId: string) {
  const [row] = await db
    .select()
    .from(contactPersonas)
    .where(and(eq(contactPersonas.orgId, orgId), eq(contactPersonas.contactId, contactId)))
    .orderBy(desc(contactPersonas.computedAt))
    .limit(1);
  return row ?? null;
}

export async function listPersonaSegment(orgId: string, persona: string, limit = 100) {
  return db
    .select()
    .from(contactPersonas)
    .where(
      and(eq(contactPersonas.orgId, orgId), eq(contactPersonas.persona, persona as PersonaType)),
    )
    .orderBy(desc(contactPersonas.computedAt))
    .limit(limit);
}
