/**
 * Campaign service — business logic for campaign CRUD and state machine.
 *
 * State machine transitions:
 *   DRAFT → SCHEDULED | SENDING
 *   SCHEDULED → SENDING | CANCELLED
 *   SENDING → SENT | PAUSED
 *   PAUSED → SENDING | CANCELLED
 *   SENT → (terminal)
 *   CANCELLED → (terminal)
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, type Campaign } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { fillMissingAltTexts } from '../editor/ai-alt-text.js';

/** Matches an <img …> tag that has no (non-empty) alt attribute. */
const IMG_WITHOUT_ALT = /<img(?![^>]*\balt\s*=\s*"[^"]+")[^>]*>/i;

/**
 * Auto-generate AI alt text for images in legacy raw-HTML campaign content.
 * Cheap pre-check first: only invokes Claude when the HTML actually contains an
 * <img> with a missing/empty alt. Best-effort — never blocks campaign save.
 */
async function applyAltText(
  orgId: string,
  content: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!content) return content;
  const html = content['html'];
  if (typeof html !== 'string' || !IMG_WITHOUT_ALT.test(html)) return content;
  try {
    const { html: fixed } = await fillMissingAltTexts(orgId, html);
    return { ...content, html: fixed };
  } catch {
    return content; // alt-text enrichment is non-critical
  }
}

// ─── State machine ───────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

/**
 * Allowed state transitions. Key = current status, value = set of valid next statuses.
 */
const TRANSITIONS: Record<CampaignStatus, Set<CampaignStatus>> = {
  draft: new Set(['scheduled', 'sending']),
  scheduled: new Set(['sending', 'cancelled']),
  sending: new Set(['sent', 'paused']),
  paused: new Set(['sending', 'cancelled']),
  sent: new Set(),
  cancelled: new Set(),
};

/**
 * Validate that a status transition is allowed.
 */
export function validateTransition(current: CampaignStatus, next: CampaignStatus): void {
  const allowed = TRANSITIONS[current];
  if (!allowed || !allowed.has(next)) {
    throw AppError.badRequest(
      `Invalid campaign status transition: ${current} → ${next}. ` +
        `Allowed from '${current}': ${[...TRANSITIONS[current]].join(', ') || 'none (terminal state)'}`,
    );
  }
}

// ─── CRUD operations ─────────────────────────────────────────────────────────

export interface CreateCampaignInput {
  orgId: string;
  name: string;
  type?: 'email' | 'sms' | 'whatsapp' | 'push' | 'voice';
  subject?: string;
  preheader?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  templateId?: string;
  content?: Record<string, unknown>;
  listId?: string;
  segmentId?: string;
  excludeSegmentId?: string;
  abConfig?: Record<string, unknown>;
  configurationSet?: string;
  scheduledAt?: Date;
  timezone?: string;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const content = await applyAltText(input.orgId, input.content);
  const [row] = await db
    .insert(campaigns)
    .values({
      orgId: input.orgId,
      name: input.name,
      type: input.type ?? 'email',
      status: 'draft',
      subject: input.subject,
      preheader: input.preheader,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      replyTo: input.replyTo,
      templateId: input.templateId,
      content: content ?? {},
      listId: input.listId,
      segmentId: input.segmentId,
      excludeSegmentId: input.excludeSegmentId,
      abConfig: input.abConfig,
      configurationSet: input.configurationSet,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone ?? 'UTC',
    })
    .returning();

  return row!;
}

export async function getCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId), isNull(campaigns.deletedAt)),
    )
    .limit(1);

  if (!row) throw AppError.notFound('Campaign');
  return row;
}

export interface ListCampaignsOpts {
  orgId: string;
  status?: CampaignStatus;
  cursor?: string;
  limit?: number;
}

export async function listCampaigns(opts: ListCampaignsOpts) {
  const limit = Math.min(opts.limit ?? 50, 100);

  const conditions = [eq(campaigns.orgId, opts.orgId), isNull(campaigns.deletedAt)];

  if (opts.status) {
    conditions.push(eq(campaigns.status, opts.status));
  }

  if (opts.cursor) {
    conditions.push(
      sql`${campaigns.createdAt} < (SELECT created_at FROM campaigns WHERE id = ${opts.cursor})`,
    );
  }

  const rows = await db
    .select()
    .from(campaigns)
    .where(and(...conditions))
    .orderBy(desc(campaigns.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

  return { data, cursor: nextCursor, hasMore };
}

export async function updateCampaign(
  orgId: string,
  campaignId: string,
  updates: Partial<Omit<CreateCampaignInput, 'orgId'>>,
): Promise<Campaign> {
  // Only allow updates on draft campaigns
  const current = await getCampaign(orgId, campaignId);
  if (current.status !== 'draft') {
    throw AppError.badRequest(
      `Cannot update campaign in '${current.status}' status. Only draft campaigns can be edited.`,
    );
  }

  const content = updates.content ? await applyAltText(orgId, updates.content) : updates.content;

  const [row] = await db
    .update(campaigns)
    .set({
      ...updates,
      ...(content ? { content } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  if (!row) throw AppError.notFound('Campaign');
  return row;
}

export async function deleteCampaign(orgId: string, campaignId: string): Promise<void> {
  const current = await getCampaign(orgId, campaignId);
  if (current.status === 'sending') {
    throw AppError.badRequest(
      'Cannot delete a campaign that is currently sending. Pause it first.',
    );
  }

  const [row] = await db
    .update(campaigns)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  if (!row) throw AppError.notFound('Campaign');
}

// ─── State transitions ──────────────────────────────────────────────────────

export async function scheduleCampaign(
  orgId: string,
  campaignId: string,
  scheduledAt: Date,
  timezone?: string,
): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'scheduled');

  // Validate the campaign is ready to schedule
  validateCampaignReadiness(current);

  if (scheduledAt <= new Date()) {
    throw AppError.badRequest('scheduledAt must be in the future');
  }

  const [row] = await db
    .update(campaigns)
    .set({
      status: 'scheduled',
      scheduledAt,
      timezone: timezone ?? current.timezone,
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

export async function sendCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'sending');
  validateCampaignReadiness(current);

  const [row] = await db
    .update(campaigns)
    .set({
      status: 'sending',
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

export async function pauseCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'paused');

  const [row] = await db
    .update(campaigns)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

export async function resumeCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'sending');

  const [row] = await db
    .update(campaigns)
    .set({ status: 'sending', updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

export async function cancelCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'cancelled');

  const [row] = await db
    .update(campaigns)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

/**
 * Mark a campaign as fully sent. Called by the worker when all batches complete.
 */
export async function markCampaignSent(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'sent');

  const [row] = await db
    .update(campaigns)
    .set({ status: 'sent', updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

/**
 * Update status from worker (internal). Bypasses auth but validates transition.
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
): Promise<void> {
  const [current] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (!current) return;

  validateTransition(current.status as CampaignStatus, status);

  await db
    .update(campaigns)
    .set({
      status,
      ...(status === 'sending' && !current.sentAt ? { sentAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateCampaignReadiness(campaign: Campaign): void {
  const errors: string[] = [];

  if (!campaign.subject) errors.push('subject is required');
  if (!campaign.fromEmail) errors.push('fromEmail is required');
  if (!campaign.fromName) errors.push('fromName is required');
  if (!campaign.listId) errors.push('listId (audience) is required');

  // Content must have either a templateId or block content
  const hasContent =
    campaign.templateId || (campaign.content && Object.keys(campaign.content).length > 0);
  if (!hasContent) errors.push('content or templateId is required');

  if (errors.length > 0) {
    throw AppError.badRequest(`Campaign is not ready: ${errors.join(', ')}`);
  }
}

// ─── Stats update (called from event pipeline) ──────────────────────────────

export async function incrementCampaignStat(
  campaignId: string,
  stat:
    | 'totalSent'
    | 'totalDelivered'
    | 'totalOpens'
    | 'totalClicks'
    | 'totalBounces'
    | 'totalUnsubscribes'
    | 'totalComplaints',
  amount = 1,
): Promise<void> {
  await db
    .update(campaigns)
    .set({
      [stat]: sql`${campaigns[stat]} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));
}
