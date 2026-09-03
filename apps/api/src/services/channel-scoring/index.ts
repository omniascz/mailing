/**
 * Channel scoring orchestrator (§9 P1 Channel Scoring per recipient).
 *
 * Collects per-channel facts from per-contact send logs over the last 90
 * days and persists scores onto contact_engagement. The smart_channel
 * workflow node reads the cached scores so it doesn't recompute on
 * every send.
 *
 * Public:
 *   refreshOrgChannelScores(orgId)         — recompute for one org
 *   refreshAllOrgsChannelScores()          — recompute for every org
 *   getContactChannelScores(contactId)     — read cached scores
 *   topContactsByChannel(orgId, channel)   — top N contacts for a channel
 *
 * Schedule via the daily-triggers orchestrator alongside RFM and
 * predictive segmentation.
 */

import { and, eq, gte, sql, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contactEngagement,
  emailEvents,
  smsSendLog,
  smsConsents,
  smsInbound,
  calls,
  pushSendLog,
  pushSubscriptions,
  whatsappConsents,
  whatsappConversations,
  contacts,
} from '../../db/schema/index.js';
import {
  CHANNEL_KINDS,
  pickPreferredChannel,
  scoreAllChannels,
  type ChannelFacts,
  type ChannelKind,
  type ChannelScores,
} from './pure.js';

const SCORE_WINDOW_DAYS = 90;

export interface ContactChannelScores {
  contactId: string;
  scores: ChannelScores;
  preferredChannel: ChannelKind | null;
  scoredAt: Date | null;
}

// ─── Public reads ─────────────────────────────────────────────────────────

export async function getContactChannelScores(
  orgId: string,
  contactId: string,
): Promise<ContactChannelScores | null> {
  const [row] = await db
    .select({
      contactId: contactEngagement.contactId,
      email: contactEngagement.emailScore,
      sms: contactEngagement.smsScore,
      whatsapp: contactEngagement.whatsappScore,
      voice: contactEngagement.voiceScore,
      push: contactEngagement.pushScore,
      preferred: contactEngagement.preferredChannel,
      scoredAt: contactEngagement.channelScoredAt,
    })
    .from(contactEngagement)
    .where(and(eq(contactEngagement.contactId, contactId), eq(contactEngagement.orgId, orgId)))
    .limit(1);
  if (!row) return null;
  return {
    contactId: row.contactId,
    scores: {
      email: row.email,
      sms: row.sms,
      whatsapp: row.whatsapp,
      voice: row.voice,
      push: row.push,
    },
    preferredChannel: row.preferred as ChannelKind | null,
    scoredAt: row.scoredAt,
  };
}

export async function topContactsByChannel(
  orgId: string,
  channel: ChannelKind,
  limit = 50,
): Promise<Array<{ contactId: string; score: number }>> {
  const column =
    channel === 'email'
      ? contactEngagement.emailScore
      : channel === 'sms'
        ? contactEngagement.smsScore
        : channel === 'whatsapp'
          ? contactEngagement.whatsappScore
          : channel === 'voice'
            ? contactEngagement.voiceScore
            : contactEngagement.pushScore;

  const rows = await db
    .select({ contactId: contactEngagement.contactId, score: column })
    .from(contactEngagement)
    .where(and(eq(contactEngagement.orgId, orgId), isNotNull(column)))
    .orderBy(sql`${column} DESC NULLS LAST`)
    .limit(Math.max(1, Math.min(limit, 1000)));
  return rows
    .filter((r): r is { contactId: string; score: number } => r.score !== null)
    .map((r) => ({ contactId: r.contactId, score: r.score }));
}

// ─── Refresh API ──────────────────────────────────────────────────────────

export async function refreshOrgChannelScores(orgId: string): Promise<{ scored: number }> {
  // Bootstrap engagement rows for any contact that doesn't have one.
  await db.execute(sql`
    INSERT INTO contact_engagement (contact_id, org_id)
    SELECT id, org_id FROM contacts WHERE org_id = ${orgId}::uuid
    ON CONFLICT (contact_id) DO NOTHING
  `);

  const rows = await db
    .select({ contactId: contactEngagement.contactId })
    .from(contactEngagement)
    .where(eq(contactEngagement.orgId, orgId));

  if (rows.length === 0) return { scored: 0 };

  const contactIds = rows.map((r) => r.contactId);
  const facts = await collectFacts(orgId, contactIds);

  let scored = 0;
  for (const contactId of contactIds) {
    const bundle = {
      email: facts.email.get(contactId) ?? blankFact(false),
      sms: facts.sms.get(contactId) ?? blankFact(facts.smsConsent.has(contactId)),
      whatsapp: facts.whatsapp.get(contactId) ?? blankFact(facts.whatsappConsent.has(contactId)),
      voice: facts.voice.get(contactId) ?? blankFact(facts.hasPhone.has(contactId)),
      push: facts.push.get(contactId) ?? blankFact(facts.pushReachable.has(contactId)),
    };
    const scores = scoreAllChannels(bundle);
    const preferred = pickPreferredChannel(scores);

    await db
      .update(contactEngagement)
      .set({
        emailScore: scores.email,
        smsScore: scores.sms,
        whatsappScore: scores.whatsapp,
        voiceScore: scores.voice,
        pushScore: scores.push,
        preferredChannel: preferred,
        channelScoredAt: new Date(),
      })
      .where(and(eq(contactEngagement.contactId, contactId), eq(contactEngagement.orgId, orgId)));
    scored++;
  }
  return { scored };
}

export async function refreshAllOrgsChannelScores(): Promise<{
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
      const r = await refreshOrgChannelScores(org_id);
      scored += r.scored;
    } catch {
      errors++;
    }
  }
  return { orgs: rows.length, scored, errors };
}

// ─── Fact collection ──────────────────────────────────────────────────────

interface CollectedFacts {
  email: Map<string, ChannelFacts>;
  sms: Map<string, ChannelFacts>;
  whatsapp: Map<string, ChannelFacts>;
  voice: Map<string, ChannelFacts>;
  push: Map<string, ChannelFacts>;
  smsConsent: Set<string>;
  whatsappConsent: Set<string>;
  hasPhone: Set<string>;
  pushReachable: Set<string>;
}

function blankFact(reachable: boolean): ChannelFacts {
  return { sends: 0, engagements: 0, daysSinceLastEngagement: null, reachable };
}

async function collectFacts(orgId: string, contactIds: string[]): Promise<CollectedFacts> {
  const since = new Date(Date.now() - SCORE_WINDOW_DAYS * 86_400_000);

  const facts: CollectedFacts = {
    email: new Map(),
    sms: new Map(),
    whatsapp: new Map(),
    voice: new Map(),
    push: new Map(),
    smsConsent: new Set(),
    whatsappConsent: new Set(),
    hasPhone: new Set(),
    pushReachable: new Set(),
  };

  if (contactIds.length === 0) return facts;

  // 1. Email events — sends + opens, last engagement timestamp
  const emailRows = (await db
    .select({
      contactId: emailEvents.contactId,
      sends: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'send')::text`,
      opens: sql<string>`count(*) filter (where ${emailEvents.eventType} = 'open')::text`,
      lastEngagement: sql<Date | null>`max(${emailEvents.createdAt}) filter (where ${emailEvents.eventType} in ('open','click'))`,
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
    lastEngagement: Date | null;
  }>;

  for (const r of emailRows) {
    if (!r.contactId) continue;
    facts.email.set(r.contactId, {
      sends: Number(r.sends),
      engagements: Number(r.opens),
      daysSinceLastEngagement: r.lastEngagement
        ? (Date.now() - new Date(r.lastEngagement).getTime()) / 86_400_000
        : null,
      reachable: true, // contacts.email is required at signup
    });
  }

  // 2. SMS — sends from smsSendLog, replies from smsInbound, consent flag
  const smsSendRows = (await db
    .select({
      contactId: smsSendLog.contactId,
      sends: sql<string>`count(*)::text`,
      lastSentAt: sql<Date | null>`max(${smsSendLog.sentAt})`,
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
    lastSentAt: Date | null;
  }>;

  const smsReplyRows = (await db
    .select({
      contactId: smsInbound.contactId,
      replies: sql<string>`count(*)::text`,
      lastInbound: sql<Date | null>`max(${smsInbound.createdAt})`,
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
    lastInbound: Date | null;
  }>;

  const smsConsentRows = (await db
    .select({ contactId: smsConsents.contactId })
    .from(smsConsents)
    .where(
      and(
        eq(smsConsents.orgId, orgId),
        inArray(
          smsConsents.contactId,
          contactIds.filter((id): id is string => !!id),
        ),
      ),
    )) as unknown as Array<{ contactId: string | null }>;
  for (const r of smsConsentRows) {
    if (r.contactId) facts.smsConsent.add(r.contactId);
  }

  const repliesByContact = new Map(
    smsReplyRows
      .filter((r): r is typeof r & { contactId: string } => !!r.contactId)
      .map((r) => [r.contactId, { replies: Number(r.replies), lastInbound: r.lastInbound }]),
  );

  for (const r of smsSendRows) {
    if (!r.contactId) continue;
    const reply = repliesByContact.get(r.contactId);
    facts.sms.set(r.contactId, {
      sends: Number(r.sends),
      engagements: reply?.replies ?? 0,
      daysSinceLastEngagement: reply?.lastInbound
        ? (Date.now() - new Date(reply.lastInbound).getTime()) / 86_400_000
        : null,
      reachable: facts.smsConsent.has(r.contactId),
    });
  }

  // 3. Voice — calls table; engagement = answered (status='completed' with
  //    durationSeconds > 0).
  const voiceRows = (await db
    .select({
      contactId: calls.contactId,
      sends: sql<string>`count(*)::text`,
      answers: sql<string>`count(*) filter (where ${calls.status} = 'completed' and ${calls.durationSeconds} > 5)::text`,
      lastAnswer: sql<Date | null>`max(${calls.createdAt}) filter (where ${calls.status} = 'completed')`,
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
    sends: string;
    answers: string;
    lastAnswer: Date | null;
  }>;

  // Phone reachability — contacts.phone is set
  const phoneRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.orgId, orgId), inArray(contacts.id, contactIds), isNotNull(contacts.phone)),
    );
  for (const r of phoneRows) facts.hasPhone.add(r.id);

  for (const r of voiceRows) {
    facts.voice.set(r.contactId, {
      sends: Number(r.sends),
      engagements: Number(r.answers),
      daysSinceLastEngagement: r.lastAnswer
        ? (Date.now() - new Date(r.lastAnswer).getTime()) / 86_400_000
        : null,
      reachable: facts.hasPhone.has(r.contactId),
    });
  }

  // 4. Push — pushSendLog; engagement = clickedAt set. Reachability = has
  //    at least one pushSubscriptions row.
  const pushRows = (await db
    .select({
      contactId: pushSendLog.contactId,
      sends: sql<string>`count(*)::text`,
      clicks: sql<string>`count(*) filter (where ${pushSendLog.clickedAt} is not null)::text`,
      lastClick: sql<Date | null>`max(${pushSendLog.clickedAt})`,
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
    lastClick: Date | null;
  }>;

  const pushSubRows = (await db
    .select({ contactId: pushSubscriptions.contactId })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.orgId, orgId),
        inArray(
          pushSubscriptions.contactId,
          contactIds.filter((id): id is string => !!id),
        ),
      ),
    )) as unknown as Array<{ contactId: string | null }>;
  for (const r of pushSubRows) {
    if (r.contactId) facts.pushReachable.add(r.contactId);
  }

  for (const r of pushRows) {
    if (!r.contactId) continue;
    facts.push.set(r.contactId, {
      sends: Number(r.sends),
      engagements: Number(r.clicks),
      daysSinceLastEngagement: r.lastClick
        ? (Date.now() - new Date(r.lastClick).getTime()) / 86_400_000
        : null,
      reachable: facts.pushReachable.has(r.contactId),
    });
  }

  // 5. WhatsApp — conversations table (no per-template send log yet).
  //    Engagement = inbound message received (lastMessageAt updates on each
  //    direction; we use conversation count as proxy for sends).
  const waConsentRows = (await db
    .select({ contactId: whatsappConsents.contactId })
    .from(whatsappConsents)
    .where(
      and(
        eq(whatsappConsents.orgId, orgId),
        inArray(
          whatsappConsents.contactId,
          contactIds.filter((id): id is string => !!id),
        ),
      ),
    )) as unknown as Array<{ contactId: string | null }>;
  for (const r of waConsentRows) {
    if (r.contactId) facts.whatsappConsent.add(r.contactId);
  }

  const waConvRows = (await db
    .select({
      contactId: whatsappConversations.contactId,
      sends: sql<string>`count(*)::text`,
      lastAt: sql<Date | null>`max(${whatsappConversations.createdAt})`,
    })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.orgId, orgId),
        inArray(whatsappConversations.contactId, contactIds),
        gte(whatsappConversations.createdAt, since),
      ),
    )
    .groupBy(whatsappConversations.contactId)) as unknown as Array<{
    contactId: string | null;
    sends: string;
    lastAt: Date | null;
  }>;

  for (const r of waConvRows) {
    if (!r.contactId) continue;
    facts.whatsapp.set(r.contactId, {
      // WhatsApp conversation rows include both inbound + outbound; we
      // treat the row count as both sends and engagements to bias the
      // score upward when conversations exist — a placeholder until a
      // dedicated wa_send_log lands.
      sends: Number(r.sends),
      engagements: Number(r.sends),
      daysSinceLastEngagement: r.lastAt
        ? (Date.now() - new Date(r.lastAt).getTime()) / 86_400_000
        : null,
      reachable: facts.whatsappConsent.has(r.contactId),
    });
  }

  return facts;
}

// silence unused — kept exported for future per-channel API surface
void CHANNEL_KINDS;
