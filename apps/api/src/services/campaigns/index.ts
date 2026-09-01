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
import { campaigns, templates as campaignTemplates, type Campaign } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { fillMissingAltTexts } from '../editor/ai-alt-text.js';
import type { UtmSettings } from './utm.js';

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

type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'queueing'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'paused'
  | 'cancelled';

/**
 * Why a campaign is in `paused`. Deliberately NOT part of the status enum and
 * NOT part of TRANSITIONS — the state machine is unchanged; this only records
 * which of several indistinguishable pauses happened, so resume can pick the
 * right action. See campaigns.pausedReason in the schema for the full reasoning.
 *
 * NULL (no reason recorded) stays the conservative case, never another state.
 *
 * 'ab_needs_review' is the A/B winner job parking a campaign for a human: the
 * test ran, the holdback was deliberately not dispatched, and resuming must not
 * pretend otherwise. It used to pause with no reason at all, which resume read
 * as an operator's pause and answered by flipping the campaign back to
 * `sending` with nothing on the queue — turning "parked, recoverable" into
 * "stuck for good".
 */
export type CampaignPausedReason = 'send_failed' | 'operator' | 'ab_needs_review';

/**
 * Allowed state transitions. Key = current status, value = set of valid next statuses.
 *
 * `queueing` sits between "the operator pressed Send" and "mail is going out".
 * It is the splitter's run, and it is short; `sending` is the delivery itself,
 * and it is long. They were one state before, which meant everything watching a
 * send in progress was watching the wrong window.
 *
 * `queueing → failed` exists for one case: an audience that turns out to be
 * empty. The splitter enqueues nothing, so no batch can ever close the campaign
 * out, and leaving it in `sending` would be the stuck state under a new name.
 *
 * `paused → queueing` is the recovery path: resuming a send that failed before
 * anything was queued goes through sendCampaign, which starts the dispatch over.
 * `paused → sending` is the other resume — the operator's own pause, where the
 * batches are already out and nothing is re-enqueued.
 */
const TRANSITIONS: Record<CampaignStatus, Set<CampaignStatus>> = {
  draft: new Set(['scheduled', 'queueing']),
  scheduled: new Set(['queueing', 'cancelled']),
  queueing: new Set(['sending', 'failed', 'paused', 'cancelled']),
  sending: new Set(['sent', 'failed', 'paused']),
  paused: new Set(['queueing', 'sending', 'cancelled']),
  sent: new Set(),
  failed: new Set(),
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
  /** Language of the copy. Falls back to the template, then to English. */
  locale?: 'en' | 'cs' | 'sk';
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
  /** UTM auto-append settings. Absent leaves the column null, i.e. off. */
  utmTracking?: UtmSettings;
  /**
   * Time-warp: deliver at `localHour` in each recipient's own timezone.
   * Absent leaves the column null, i.e. off — same convention as utmTracking.
   */
  timewarp?: {
    enabled: boolean;
    localHour: number;
    fallbackTimezone?: string;
    skipHolidays?: boolean;
    holidayCountry?: 'cz' | 'sk';
  };
  configurationSet?: string;
  category?: string;
  scheduledAt?: Date;
  timezone?: string;
}

/**
 * The language of a campaign, and where it comes from.
 *
 * Explicit wins: someone writing a campaign from scratch says what language it
 * is in. Otherwise it is inherited from the template the campaign was started
 * from — the template is where the copy came from, so it is where the language
 * came from too. With neither, English, which is also the column default: a
 * campaign with no stated language is not a broken campaign, it just renders
 * the English label in the footer.
 *
 * Deliberately NOT the organisation's language. There is no such column, and
 * adding one would be the wrong shape anyway: a Czech shop mailing its foreign
 * customers in English is one organisation with two languages, and language
 * belongs to the message. Deliberately NOT sniffed from the content either —
 * guessing wrong puts the wrong word on the one link the law requires.
 */
async function resolveCampaignLocale(input: CreateCampaignInput): Promise<'en' | 'cs' | 'sk'> {
  if (input.locale) return input.locale;
  if (!input.templateId) return 'en';
  const [tpl] = await db
    .select({ locale: campaignTemplates.locale })
    .from(campaignTemplates)
    .where(
      and(eq(campaignTemplates.id, input.templateId), eq(campaignTemplates.orgId, input.orgId)),
    )
    .limit(1);
  const fromTemplate = tpl?.locale;
  return fromTemplate === 'cs' || fromTemplate === 'sk' ? fromTemplate : 'en';
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const content = await applyAltText(input.orgId, input.content);
  const locale = await resolveCampaignLocale(input);
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
      utmTracking: input.utmTracking,
      // Explicit, because this insert names its columns one by one. A field
      // added to CreateCampaignInput and not to this list is accepted by the
      // route, validated, and then silently dropped — which is exactly how the
      // time-warp column stayed null while the request said 201.
      timewarp: input.timewarp,
      configurationSet: input.configurationSet,
      category: input.category,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone ?? 'UTC',
      locale,
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
  /** A folder id, or 'none' for the campaigns in no folder at all. */
  folderId?: string | 'none';
  cursor?: string;
  limit?: number;
}

export async function listCampaigns(opts: ListCampaignsOpts) {
  const limit = Math.min(opts.limit ?? 50, 100);

  const conditions = [eq(campaigns.orgId, opts.orgId), isNull(campaigns.deletedAt)];

  if (opts.status) {
    conditions.push(eq(campaigns.status, opts.status));
  }

  // 'none' is a real answer to "which folder", not a missing filter: it is the
  // Unfiled drawer, and it has to be reachable, or a campaign filed by mistake
  // can only be found again by clearing every filter.
  if (opts.folderId === 'none') {
    conditions.push(isNull(campaigns.folderId));
  } else if (opts.folderId) {
    conditions.push(eq(campaigns.folderId, opts.folderId));
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

/**
 * Put a campaign in a folder, or take it out of one.
 *
 * Deliberately not part of updateCampaign, which refuses anything that is not
 * a draft. Filing is not editing: the campaigns most in need of tidying are
 * the sent ones, and a rule meant to protect content in flight must not stop
 * someone from organising their own archive.
 */
export async function moveCampaignToFolder(
  orgId: string,
  campaignId: string,
  folderId: string | null,
): Promise<Campaign> {
  const [row] = await db
    .update(campaigns)
    .set({ folderId, updatedAt: new Date() })
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId), isNull(campaigns.deletedAt)),
    )
    .returning();
  if (!row) throw AppError.notFound('Campaign');
  return row;
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
  validateTransition(current.status as CampaignStatus, 'queueing');
  validateCampaignReadiness(current);

  const [row] = await db
    .update(campaigns)
    .set({
      // Not 'sending' — nothing is being sent yet. The splitter has not run, so
      // there is no audience, no batches and no mail. It moves to 'sending'
      // once every batch is on the queue.
      status: 'queueing',
      sentAt: new Date(),
      updatedAt: new Date(),
      // Entering the send ends whatever pause came before, so the reason for
      // that pause stops being true here. Clearing it at the transition rather
      // than at the next pause is what keeps a stale value from ever being read
      // as the cause of a later one.
      pausedReason: null,
      // A fresh dispatch starts with a clean slate. The previous attempt's
      // counter must not survive into this one, or the first batch to report
      // would decrement a number that belongs to a send that is over.
      plannedRecipients: null,
      pendingBatches: null,
      // And the phase marker with them: a fresh send is not waiting on the
      // previous attempt's winner dispatch.
      awaitingAbWinner: false,
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
    .set({
      status: 'paused',
      updatedAt: new Date(),
      // A human did this. Batches may already be on their way, so resume must
      // NOT enqueue — see resumeCampaign.
      pausedReason: 'operator' satisfies CampaignPausedReason,
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

export async function resumeCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'sending');

  // An A/B campaign parked for review is the one pause resume must refuse.
  //
  // Its variants went out and its holdback deliberately did not, so there is
  // nothing on the queue to carry on with. Resume's other branch would flip it
  // to `sending` and enqueue nothing; the counter is NULL for an A/B dispatch
  // and the reaper skips those, so the campaign would sit in `sending` with no
  // batch, no winner job and nothing that could ever close it. The operator's
  // only button turned a recoverable park into a permanent stall.
  //
  // Refusing is honest: the decision this campaign is waiting for is which
  // variant to send, and resume cannot answer it.
  if (current.pausedReason === ('ab_needs_review' satisfies CampaignPausedReason)) {
    throw AppError.badRequest(
      'This A/B campaign is waiting for you to choose a winning variant, not for it to be ' +
        'resumed. Its test variants have already gone out; the remaining contacts were held ' +
        'back on purpose. Open the A/B result to see how the variants performed and pick one ' +
        'from there — resuming would leave the campaign with nothing left to send.',
      { pausedReason: current.pausedReason },
    );
  }

  // Two pauses that look identical in `status` need opposite actions, and the
  // only thing that tells them apart is why the pause happened.
  //
  // 'send_failed': the dispatch threw after the flip to 'sending' and rolled
  // back, so nothing ever reached the queue. Resuming means running the send
  // for real — the same path the Send button takes, rollback and all.
  //
  // Anything else — an operator's pause, or NULL because the row predates this
  // column or was paused by a path that records no reason (ab-winner parking a
  // campaign for review) — keeps the old behaviour: flip the status and enqueue
  // NOTHING.
  //
  // The default side is the safe one on purpose. Enqueueing again is not
  // idempotent: the dispatch ledger is scoped per enqueue attempt
  // (campaign-dispatch-batches.ts says so outright — "a legitimate resend
  // starts with an empty ledger and is free to enqueue everything again"), so
  // guessing wrong here sends the entire audience a second time. A campaign
  // that stays put is a worse outcome for one campaign; a duplicate send is a
  // worse outcome for every recipient on it.
  if (current.pausedReason === ('send_failed' satisfies CampaignPausedReason)) {
    // enqueueCampaignSend calls sendCampaign, which performs the flip and
    // clears pausedReason — so a second Resume finds NULL and takes the branch
    // below instead of enqueueing twice.
    const { enqueueCampaignSend } = await import('./dispatch.js');
    return enqueueCampaignSend(orgId, campaignId);
  }

  const [row] = await db
    .update(campaigns)
    .set({ status: 'sending', updatedAt: new Date(), pausedReason: null })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

export async function cancelCampaign(orgId: string, campaignId: string): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'cancelled');

  const [row] = await db
    .update(campaigns)
    .set({ status: 'cancelled', updatedAt: new Date(), awaitingAbWinner: false })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

/**
 * Mark a campaign as fully sent. Called by the worker when all batches complete.
 */
export async function markCampaignSent(
  orgId: string,
  campaignId: string,
  totals?: { totalSent: number },
): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'sent');

  const [row] = await db
    .update(campaigns)
    .set({
      status: 'sent',
      updatedAt: new Date(),
      // The dispatch is over, so nothing is outstanding. Left set, the counter
      // would look like an unfinished send to the reaper.
      pendingBatches: null,
      // Nor is anything still to be added to it.
      awaitingAbWinner: false,
      ...(totals ? { totalSent: totals.totalSent } : {}),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  return row!;
}

/**
 * The other end of the same finish line: every batch reported and not one of
 * them sent anything. A sibling of markCampaignSent rather than a flag on it,
 * because it is a different transition with a different meaning — `sent` with
 * zero recipients would be a lie, and silence would be the stuck state again.
 */
export async function markCampaignFailed(
  orgId: string,
  campaignId: string,
  reason: string,
): Promise<Campaign> {
  const current = await getCampaign(orgId, campaignId);
  validateTransition(current.status as CampaignStatus, 'failed');

  const [row] = await db
    .update(campaigns)
    .set({
      status: 'failed',
      updatedAt: new Date(),
      pendingBatches: null,
      awaitingAbWinner: false,
      pausedReason: null,
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .returning();

  console.warn(`[campaign] ${campaignId} finished with nothing sent: ${reason}`);
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
      // Same rule as everywhere else: a reason only survives while the pause it
      // describes does. This setter takes an arbitrary status, so it clears on
      // anything that is not 'paused' — and it never sets one, because it has no
      // idea why its caller is pausing. NULL then means "no reason recorded",
      // which readers treat as the conservative case.
      pausedReason: status === 'paused' ? current.pausedReason : null,
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

  assertAbConfigCanFinish(campaign);
}

/**
 * Refuse an A/B configuration whose holdback nobody would ever send.
 *
 * An A/B campaign is closed out by its winner job, and the splitter only
 * schedules that job when there is a test window to wait for. A config that
 * holds contacts back but names no `testDurationHours` therefore produces a
 * campaign with a holdback that never goes out and no mechanism that can ever
 * finish it — it sits in `sending` until somebody opens a SQL console.
 *
 * Checked here, at the click on Send, rather than at save: this runs inside
 * sendCampaign BEFORE the status flip, so a refused campaign stays exactly
 * where it was instead of being rolled back to a pause. It also covers the
 * scheduled-campaign cron, which reaches the same choke point.
 *
 * Deliberately narrow. Variants summing to 100 are NOT refused — that is a
 * legitimate single-phase test with no holdback, and the splitter arms the
 * ordinary batch counter for it. `autoSendWinner: false` is not refused either:
 * the winner job still runs and parks the campaign for a human.
 */
function assertAbConfigCanFinish(campaign: Campaign): void {
  const cfg = campaign.abConfig as
    | { variants?: { percentage?: number }[]; testDurationHours?: number }
    | null
    | undefined;
  if (!cfg || !Array.isArray(cfg.variants) || cfg.variants.length < 2) return;

  const totalVariantPct = cfg.variants.reduce((sum, v) => sum + (Number(v?.percentage) || 0), 0);
  const holdbackPct = Math.max(0, 100 - totalVariantPct);
  if (holdbackPct <= 0) return;

  if (!cfg.testDurationHours || cfg.testDurationHours <= 0) {
    throw AppError.badRequest(
      `This A/B test holds back ${holdbackPct.toFixed(1)}% of the audience for the winning ` +
        'variant, but it does not say how long the test should run, so the winner would never ' +
        'be picked and those contacts would never be sent anything. Set a test duration in ' +
        'hours, or raise the variant percentages to 100 so the whole audience is part of the ' +
        'test and there is no holdback.',
      { holdbackPct, testDurationHours: cfg.testDurationHours ?? null },
    );
  }
}
