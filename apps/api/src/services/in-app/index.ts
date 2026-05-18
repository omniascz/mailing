/**
 * In-app messaging service (task 7.11).
 *
 * Core features:
 *   - CRUD for in-app messages
 *   - Targeting engine: match active messages to a contact + page URL
 *   - Frequency capping: max 1 show per session per message
 *   - Impression + click tracking
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  inAppMessages,
  inAppImpressions,
  type InAppTargetingRule,
} from '../../db/schema/in-app.js';
import { AppError } from '../../lib/app-error.js';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listInAppMessages(orgId: string, activeOnly = false) {
  const rows = await db
    .select()
    .from(inAppMessages)
    .where(eq(inAppMessages.orgId, orgId));

  return activeOnly ? rows.filter((r) => r.active) : rows;
}

export async function getInAppMessage(id: string, orgId: string) {
  const [msg] = await db
    .select()
    .from(inAppMessages)
    .where(and(eq(inAppMessages.id, id), eq(inAppMessages.orgId, orgId)))
    .limit(1);

  if (!msg) throw AppError.notFound('InAppMessage');
  return msg;
}

export async function createInAppMessage(
  orgId: string,
  data: {
    name: string;
    widgetType?: 'banner' | 'modal' | 'slideout';
    position?: 'top' | 'bottom' | 'center' | 'left' | 'right';
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
    backgroundColor?: string;
    textColor?: string;
    imageUrl?: string;
    targetingRules?: InAppTargetingRule[];
    maxPerSession?: number;
    maxTotal?: number;
    autoCloseSeconds?: number;
    campaignId?: string;
    startAt?: Date;
    endAt?: Date;
  },
) {
  const [msg] = await db
    .insert(inAppMessages)
    .values({ orgId, ...data, targetingRules: data.targetingRules ?? [] })
    .returning();

  return msg;
}

export async function updateInAppMessage(
  id: string,
  orgId: string,
  data: Partial<Omit<typeof inAppMessages.$inferInsert, 'id' | 'orgId' | 'createdAt'>>,
) {
  const [msg] = await db
    .update(inAppMessages)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(inAppMessages.id, id), eq(inAppMessages.orgId, orgId)))
    .returning();

  if (!msg) throw AppError.notFound('InAppMessage');
  return msg;
}

export async function deleteInAppMessage(id: string, orgId: string) {
  await db
    .delete(inAppMessages)
    .where(and(eq(inAppMessages.id, id), eq(inAppMessages.orgId, orgId)));
}

// ─── Targeting engine ─────────────────────────────────────────────────────────

export interface MatchContext {
  contactId?: string;
  sessionId: string;
  pageUrl?: string;
  segmentIds?: string[];
  customFields?: Record<string, unknown>;
}

/**
 * Returns all active in-app messages that match the context.
 * Used by the SDK via GET /api/v1/in-app/messages?session_id=X&page_url=Y
 */
export async function getMatchingMessages(orgId: string, ctx: MatchContext) {
  const now = new Date();

  // Fetch active, non-expired messages
  const candidates = await db
    .select()
    .from(inAppMessages)
    .where(and(eq(inAppMessages.orgId, orgId), eq(inAppMessages.active, true)))
    .limit(200);

  const filtered = candidates.filter((msg) => {
    // Date window
    if (msg.startAt && msg.startAt > now) return false;
    if (msg.endAt && msg.endAt < now) return false;

    // Targeting rules (all must match)
    const rules = (msg.targetingRules ?? []) as InAppTargetingRule[];
    return rules.every((rule) => matchRule(rule, ctx));
  });

  return filtered;
}

function matchRule(rule: InAppTargetingRule, ctx: MatchContext): boolean {
  switch (rule.type) {
    case 'page_url': {
      if (!ctx.pageUrl) return false;
      const val = rule.value as string;
      switch (rule.operator) {
        case 'is': return ctx.pageUrl === val;
        case 'contains': return ctx.pageUrl.includes(val);
        case 'starts_with': return ctx.pageUrl.startsWith(val);
        default: return false;
      }
    }

    case 'segment': {
      if (!ctx.segmentIds?.length) return false;
      const val = Array.isArray(rule.value) ? rule.value : [rule.value];
      return rule.operator === 'in'
        ? val.some((v) => ctx.segmentIds!.includes(v))
        : ctx.segmentIds.includes(rule.value as string);
    }

    case 'custom_field': {
      // For simple string match
      const fieldVal = ctx.customFields?.[rule.value as string];
      return fieldVal != null;
    }

    default:
      return true;
  }
}

// ─── Frequency capping ────────────────────────────────────────────────────────

/**
 * Check whether a message should be shown to this session/contact.
 * Returns true if it is OK to show.
 */
export async function checkFrequency(
  messageId: string,
  sessionId: string,
  contactId: string | undefined,
  maxPerSession: number,
  maxTotal: number,
): Promise<boolean> {
  // Session check
  if (maxPerSession > 0) {
    const [sessionCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(inAppImpressions)
      .where(
        and(eq(inAppImpressions.messageId, messageId), eq(inAppImpressions.sessionId, sessionId)),
      )
      .limit(1);

    if ((sessionCount?.count ?? 0) >= maxPerSession) return false;
  }

  // Total per contact check
  if (maxTotal > 0 && contactId) {
    const [totalCount] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(inAppImpressions)
      .where(
        and(eq(inAppImpressions.messageId, messageId), eq(inAppImpressions.contactId, contactId)),
      )
      .limit(1);

    if ((totalCount?.count ?? 0) >= maxTotal) return false;
  }

  return true;
}

// ─── Impression + click tracking ──────────────────────────────────────────────

export async function trackImpression(
  orgId: string,
  messageId: string,
  sessionId: string,
  eventType: 'shown' | 'clicked' | 'dismissed',
  contactId?: string,
  pageUrl?: string,
) {
  await db.insert(inAppImpressions).values({
    orgId,
    messageId,
    contactId,
    sessionId,
    pageUrl,
    eventType,
  });

  // Increment counters on message
  if (eventType === 'shown') {
    await db
      .update(inAppMessages)
      .set({ impressions: sql`${inAppMessages.impressions} + 1` })
      .where(eq(inAppMessages.id, messageId));
  } else if (eventType === 'clicked') {
    await db
      .update(inAppMessages)
      .set({ clicks: sql`${inAppMessages.clicks} + 1` })
      .where(eq(inAppMessages.id, messageId));
  }
}
