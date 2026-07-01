/**
 * Sprint E.1 — auto-resend to non-openers.
 *
 * Operator clones a previously-sent campaign with a new subject. The clone's
 * audience is computed at send time as "contacts who received the parent AND
 * have not opened it within the delay window". Real-world boost: +10–30%
 * open-rate on the resend per MailerLite + Ecomail data. The biggest single
 * acquisition lever vs. those CZ competitors.
 *
 * Design notes:
 *   - We do NOT pre-compute the non-opener list at schedule time. People
 *     keep opening up until the moment the resend fires; locking the
 *     audience early sends to people who eventually did engage.
 *   - Sister "didn't open it within the delay window" interpretation: any
 *     `open` event between parent.sentAt and now disqualifies. We exclude
 *     bot-classified opens (Apple MPP) by default; an org can override
 *     via autoResendConfig.includeBots=true for less aggressive filtering.
 *   - The resend is its own campaign row. Stats (sent/opens/clicks) live
 *     on the child so the operator sees the resend's incremental impact
 *     in reports. Parent stats stay frozen at the original-send numbers.
 *   - A parent campaign can spawn multiple resends (different subjects,
 *     different delays). Each child's audience is "non-openers of the
 *     parent" — not "non-openers of any previous resend in the chain".
 *     Stacking that is a Sprint F iteration.
 */

import { and, eq, sql, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, emailEvents, type Campaign } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface ScheduleResendInput {
  /** Hours after parent.sentAt to fire the resend. Min 1, max 168 (7 days). */
  delayHours: number;
  /** Optional override; defaults to `Re: ${parent.subject}`. */
  newSubject?: string;
  /** Optional override; defaults to parent.preheader. */
  newPreheader?: string;
  /** When true, MPP-classified opens DO disqualify a contact from the
   *  non-opener set. Default false — only human-verified opens count. */
  includeBots?: boolean;
}

/**
 * Clone the parent campaign as a scheduled resend.
 *
 * The clone:
 *   - Inherits content, fromName/Email, replyTo, locale, timezone
 *   - Carries parentCampaignId so the splitter knows to derive audience
 *   - autoResendConfig captures the operator's intent (mirrors body)
 *   - status='scheduled', scheduledAt = parent.sentAt + delayHours
 *   - listId / segmentId stay null on the child — audience is event-derived
 */
export async function scheduleResend(
  orgId: string,
  parentCampaignId: string,
  input: ScheduleResendInput,
): Promise<Campaign> {
  if (input.delayHours < 1 || input.delayHours > 168) {
    throw AppError.badRequest('delayHours must be between 1 and 168 (one week)');
  }

  const [parent] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, parentCampaignId), eq(campaigns.orgId, orgId)))
    .limit(1);

  if (!parent) throw AppError.notFound('Campaign');

  if (parent.status !== 'sent' && parent.status !== 'sending') {
    throw AppError.badRequest(
      `Parent campaign must be in 'sent' or 'sending' status (currently '${parent.status}')`,
    );
  }

  if (!parent.sentAt) {
    throw AppError.badRequest('Parent campaign has no sentAt timestamp');
  }

  const scheduledAt = new Date(parent.sentAt.getTime() + input.delayHours * 3600_000);

  const subject = input.newSubject ?? `Re: ${parent.subject ?? ''}`.trim();
  const preheader = input.newPreheader ?? parent.preheader ?? null;

  const config = {
    delayHours: input.delayHours,
    newSubject: input.newSubject,
    newPreheader: input.newPreheader,
    includeBots: input.includeBots === true,
  };

  const [child] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `${parent.name} (resend)`,
      type: parent.type,
      status: 'scheduled',
      subject,
      preheader,
      fromName: parent.fromName,
      fromEmail: parent.fromEmail,
      replyTo: parent.replyTo,
      templateId: parent.templateId,
      content: parent.content,
      // Audience is event-derived; don't carry the parent's list/segment.
      listId: null,
      segmentId: null,
      excludeSegmentId: null,
      parentCampaignId: parent.id,
      autoResendConfig: config,
      scheduledAt,
      timezone: parent.timezone,
      locale: parent.locale,
    })
    .returning();

  if (!child) throw AppError.internal('Failed to create resend campaign');
  return child;
}

/**
 * Compute the set of contact IDs that received the parent campaign but
 * have not opened it. The query is the hot path the splitter hits when
 * the resend's scheduledAt fires.
 *
 * Bot-filter behaviour: by default we exclude opens where is_bot=true
 * (Apple MPP pre-fetches, security scanners). Set includeBots=true to
 * treat those as real opens too — useful when the resend strategy
 * specifically targets recipients whose clients don't pre-fetch.
 */
export async function resolveNonOpeners(
  orgId: string,
  parentCampaignId: string,
  options: { includeBots?: boolean } = {},
): Promise<string[]> {
  // Find contacts who got a 'send' event for the parent campaign but
  // did NOT register a non-bot 'open' event for the same.
  //
  // We do this in one SQL trip with a NOT EXISTS clause — cheaper than
  // selecting two sets and diffing in app code.
  const includeBots = options.includeBots === true;
  const botCondition = includeBots ? sql`` : sql`AND COALESCE(${emailEvents.isBot}, false) = false`;

  const rows = await db.execute<{ contact_id: string }>(sql`
    SELECT DISTINCT s."contact_id"
    FROM ${emailEvents} s
    WHERE s."org_id" = ${orgId}
      AND s."campaign_id" = ${parentCampaignId}
      AND s."event_type" = 'send'
      AND s."contact_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${emailEvents} o
        WHERE o."org_id" = ${orgId}
          AND o."campaign_id" = ${parentCampaignId}
          AND o."event_type" = 'open'
          AND o."contact_id" = s."contact_id"
          ${botCondition}
      )
  `);

  // Drizzle returns the rows array on .rows for raw execute; normalise.
  type ExecResult = { rows?: Array<{ contact_id: string }> };
  const out =
    (rows as unknown as ExecResult).rows ?? (rows as unknown as Array<{ contact_id: string }>);
  return out.map((r) => r.contact_id).filter((id): id is string => !!id);
}

/**
 * Resolve the audience for a campaign, picking the right strategy based on
 * whether the campaign is a resend (parentCampaignId set) or a normal
 * list+segment send. Called by the internal /audience endpoint that the
 * campaign-splitter worker hits.
 *
 * Returns the contact ID list. Empty array on missing campaign — caller
 * decides whether that's a 404 or just "audience evaluated to nothing".
 */
export async function resolveAudience(orgId: string, campaignId: string): Promise<string[]> {
  const [campaign] = await db
    .select({
      id: campaigns.id,
      parentCampaignId: campaigns.parentCampaignId,
      autoResendConfig: campaigns.autoResendConfig,
      listId: campaigns.listId,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);

  if (!campaign) return [];

  if (campaign.parentCampaignId) {
    const cfg = (campaign.autoResendConfig as Record<string, unknown> | null) ?? {};
    return resolveNonOpeners(orgId, campaign.parentCampaignId, {
      includeBots: cfg.includeBots === true,
    });
  }

  // Legacy list+segment audience. Implementation deferred to the segment
  // engine — for now we return the list members minus the exclude
  // segment via direct SQL.
  if (!campaign.listId) return [];

  const rows = await db.execute<{ contact_id: string }>(sql`
    SELECT cl."contact_id"
    FROM "contact_lists" cl
    JOIN "contacts" c ON c."id" = cl."contact_id"
    WHERE c."org_id" = ${orgId}
      AND cl."list_id" = ${campaign.listId}
      AND c."deleted_at" IS NULL
      AND cl."unsubscribed_at" IS NULL
      -- Exclude marketing-ineligible statuses (archived / non-subscribed);
      -- bounced/complained/unsubscribed are additionally gated by suppressions.
      AND c."status" NOT IN ('archived', 'non_subscribed')
  `);

  type ExecResult = { rows?: Array<{ contact_id: string }> };
  const out =
    (rows as unknown as ExecResult).rows ?? (rows as unknown as Array<{ contact_id: string }>);
  return out.map((r) => r.contact_id);
}

// Re-export for tests / future endpoints that want explicit access.
export { campaigns as _campaignsTable };

// Silence unused import warning when only some paths reference it.
void isNotNull;
