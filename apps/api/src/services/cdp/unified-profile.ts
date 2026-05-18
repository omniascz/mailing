/**
 * Unified profile view (#265) — one-query merged customer profile across
 * every CDP source in ForgeMsg. Wrapped with a Redis cache-aside so the
 * typical agent/API read costs a single round-trip.
 *
 * Invalidation: bump the profile key whenever identity merges run, when
 * traits recompute, or when a channel records a fresh event for the contact.
 * Call `invalidateProfile(orgId, contactId)` from those write paths.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts, contactEngagement,
  emailEvents, revenueEvents,
  helpdeskTickets,
  sitePageViews,
  loyaltyMembers,
  contactTraits,
  identitySignals,
  cdpEvents,
  type Contact,
} from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';

const PROFILE_TTL_SEC = 60; // short enough that stale writes self-heal, long enough to absorb bursts

export interface UnifiedProfile {
  contact: Contact;
  engagement: {
    totalOpens: number;
    totalClicks: number;
    totalSends: number;
    totalOrders: number;
    totalRevenue: string;
    lastOrderAt: Date | null;
    predictedClv: string | null;
    purchaseLikelihood: string | null;
    churnRisk: string | null;
    rfmSegment: string | null;
  } | null;
  traits: Record<string, unknown>;
  identities: Array<{
    signalType: string;
    signalValue: string;
    confidence: number;
    source: string | null;
    lastSeenAt: Date;
  }>;
  recentActivity: {
    emails: Array<{ eventType: string; campaignId: string | null; linkUrl: string | null; createdAt: Date }>;
    orders: Array<{ id: string; orderId: string | null; amount: string; currency: string; occurredAt: Date }>;
    tickets: Array<{ id: string; subject: string | null; status: string | null; channel: string | null; updatedAt: Date }>;
    pageViews: Array<{ url: string; path: string | null; occurredAt: Date }>;
    customEvents: Array<{ name: string; source: string | null; properties: Record<string, unknown>; occurredAt: Date }>;
  };
  loyalty: { balance: number; tier: string | null } | null;
}

const RECENT_LIMIT = 20;

function cacheKey(orgId: string, contactId: string): string {
  return `cdp:profile:${orgId}:${contactId}`;
}

export async function invalidateProfile(orgId: string, contactId: string): Promise<void> {
  await redis.del(cacheKey(orgId, contactId));
}

export async function invalidateProfilesBulk(orgId: string, contactIds: string[]): Promise<void> {
  if (contactIds.length === 0) return;
  const pipeline = redis.pipeline();
  for (const id of contactIds) pipeline.del(cacheKey(orgId, id));
  await pipeline.exec();
}

export async function getUnifiedProfile(
  orgId: string,
  contactId: string,
  opts: { bypassCache?: boolean } = {},
): Promise<UnifiedProfile> {
  const key = cacheKey(orgId, contactId);
  if (!opts.bypassCache) {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as UnifiedProfile;
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  if (!contact) throw AppError.notFound('Contact');

  const [engagementRow] = await db
    .select()
    .from(contactEngagement)
    .where(eq(contactEngagement.contactId, contactId))
    .limit(1);

  const [traitRow] = await db
    .select()
    .from(contactTraits)
    .where(eq(contactTraits.contactId, contactId))
    .limit(1);

  const identityRows = await db
    .select({
      signalType: identitySignals.signalType,
      signalValue: identitySignals.signalValue,
      confidence: identitySignals.confidence,
      source: identitySignals.source,
      lastSeenAt: identitySignals.lastSeenAt,
    })
    .from(identitySignals)
    .where(and(eq(identitySignals.orgId, orgId), eq(identitySignals.contactId, contactId)))
    .orderBy(desc(identitySignals.confidence), desc(identitySignals.lastSeenAt))
    .limit(50);

  const emailActivity = await db
    .select({
      eventType: emailEvents.eventType,
      campaignId: emailEvents.campaignId,
      linkUrl: emailEvents.linkUrl,
      createdAt: emailEvents.createdAt,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.contactId, contactId)))
    .orderBy(desc(emailEvents.createdAt))
    .limit(RECENT_LIMIT);

  const orders = await db
    .select({
      id: revenueEvents.id,
      orderId: revenueEvents.orderId,
      amount: revenueEvents.amount,
      currency: revenueEvents.currency,
      occurredAt: revenueEvents.occurredAt,
    })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), eq(revenueEvents.contactId, contactId)))
    .orderBy(desc(revenueEvents.occurredAt))
    .limit(RECENT_LIMIT);

  const tickets = await db
    .select({
      id: helpdeskTickets.id,
      subject: helpdeskTickets.subject,
      status: helpdeskTickets.status,
      channel: helpdeskTickets.channel,
      updatedAt: helpdeskTickets.updatedAt,
    })
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.orgId, orgId), eq(helpdeskTickets.contactId, contactId)))
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(RECENT_LIMIT);

  const pageViews = await db
    .select({
      url: sitePageViews.url,
      path: sitePageViews.path,
      occurredAt: sitePageViews.occurredAt,
    })
    .from(sitePageViews)
    .where(and(eq(sitePageViews.orgId, orgId), eq(sitePageViews.contactId, contactId)))
    .orderBy(desc(sitePageViews.occurredAt))
    .limit(RECENT_LIMIT);

  const customEvents = await db
    .select({
      name: cdpEvents.name,
      source: cdpEvents.source,
      properties: cdpEvents.properties,
      occurredAt: cdpEvents.occurredAt,
    })
    .from(cdpEvents)
    .where(and(eq(cdpEvents.orgId, orgId), eq(cdpEvents.contactId, contactId)))
    .orderBy(desc(cdpEvents.occurredAt))
    .limit(RECENT_LIMIT);

  const [loyaltyRow] = await db
    .select({ pointBalance: loyaltyMembers.pointBalance, currentTierId: loyaltyMembers.currentTierId })
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.orgId, orgId), eq(loyaltyMembers.contactId, contactId)))
    .limit(1);

  const profile: UnifiedProfile = {
    contact,
    engagement: engagementRow ? {
      totalOpens: engagementRow.totalOpens,
      totalClicks: engagementRow.totalClicks,
      totalSends: engagementRow.totalSends,
      totalOrders: engagementRow.totalOrders,
      totalRevenue: engagementRow.totalRevenue,
      lastOrderAt: engagementRow.lastOrderAt,
      predictedClv: engagementRow.predictedClv,
      purchaseLikelihood: engagementRow.purchaseLikelihood,
      churnRisk: engagementRow.churnRisk,
      rfmSegment: engagementRow.rfmSegment,
    } : null,
    traits: traitRow?.values ?? {},
    identities: identityRows,
    recentActivity: {
      emails: emailActivity.map((r) => ({
        eventType: r.eventType,
        campaignId: r.campaignId,
        linkUrl: r.linkUrl,
        createdAt: r.createdAt,
      })),
      orders,
      tickets,
      pageViews,
      customEvents: customEvents.map((r) => ({
        name: r.name,
        source: r.source,
        properties: r.properties,
        occurredAt: r.occurredAt,
      })),
    },
    loyalty: loyaltyRow ? {
      balance: Number(loyaltyRow.pointBalance ?? 0),
      tier: loyaltyRow.currentTierId ?? null,
    } : null,
  };

  await redis.setex(key, PROFILE_TTL_SEC, JSON.stringify(profile));
  return profile;
}

/**
 * Bulk variant — used by activation (#266) and segment enrichment.
 * Fetches concurrently; cache-aware per contact.
 */
export async function getUnifiedProfiles(
  orgId: string,
  contactIds: string[],
): Promise<UnifiedProfile[]> {
  const unique = [...new Set(contactIds)];
  const results = await Promise.all(
    unique.map((id) => getUnifiedProfile(orgId, id).catch(() => null)),
  );
  return results.filter((p): p is UnifiedProfile => p !== null);
}

/**
 * Lookup by any identity signal (email/phone/cookie/…) — resolves to a
 * contact via the identity graph, then returns the profile.
 */
export async function getProfileBySignal(
  orgId: string,
  signalType: string,
  signalValue: string,
): Promise<UnifiedProfile | null> {
  const [row] = await db
    .select({ contactId: identitySignals.contactId })
    .from(identitySignals)
    .where(and(
      eq(identitySignals.orgId, orgId),
      eq(identitySignals.signalType, signalType),
      eq(identitySignals.signalValue, signalValue),
    ))
    .limit(1);
  if (!row) return null;
  return getUnifiedProfile(orgId, row.contactId);
}
