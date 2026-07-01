/**
 * Workflow trigger evaluation (task 5.3).
 *
 * Trigger types:
 *   list_subscribe      — contact added to a specific list
 *   tag_added           — specific tag assigned to contact
 *   date_field          — custom date field matches today (birthdays, anniversaries)
 *   name_day_today      — contact first_name matches today's CZ/SK jmeniny (#360/#384)
 *   api_event           — custom event sent via POST /api/v1/events
 *   form_submit         — signup form submitted
 *   purchase_event      — e-commerce webhook (purchase/cart abandoned)
 *   n_days_before_holiday — fires when today is N days before a CZ/SK public holiday (#389)
 *   manual              — manually triggered via API
 *
 * Each fire() function resolves which contacts should start a new run
 * and calls startWorkflowRun() for each.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  workflows,
  workflowRuns,
  workflowEvents,
  deals,
  rssCampaigns,
  contacts,
  type WorkflowRun,
} from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';
import { startWorkflowRun } from './executor.js';
import { nameDaysFor as nameDaysCs } from '@forgemsg/i18n-cs/name-days';
import { nameDaysFor as nameDaysSk } from '@forgemsg/i18n-sk/name-days';
import { czechHolidaysInDays } from '@forgemsg/i18n-cs';
import { slovakHolidaysInDays } from '@forgemsg/i18n-sk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TriggerFireResult {
  workflowId: string;
  triggered: number;
  errors: number;
}

// ─── Deduplication guard ──────────────────────────────────────────────────────

/**
 * Prevent starting a duplicate run for the same contact + workflow.
 * A contact can only have one active (pending/running/waiting) run per workflow.
 */
async function isAlreadyRunning(workflowId: string, contactId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.contactId, contactId),
        sql`status IN ('pending', 'running', 'waiting')`,
      ),
    )
    .limit(1);
  return !!row;
}

async function safeStartRun(
  workflowId: string,
  orgId: string,
  contactId: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  if (await isAlreadyRunning(workflowId, contactId)) return false;
  await startWorkflowRun(workflowId, orgId, contactId, data ?? {});
  return true;
}

// ─── Trigger: list_subscribe ──────────────────────────────────────────────────

/**
 * Fire when a contact is added to a specific list.
 * config: { listId: string }
 */
export async function fireListSubscribeTrigger(
  workflowId: string,
  orgId: string,
  contactId: string,
  listId: string,
): Promise<TriggerFireResult> {
  const [workflow] = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig, status: workflows.status })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.orgId, orgId)))
    .limit(1);

  if (!workflow || workflow.status !== 'active') return { workflowId, triggered: 0, errors: 0 };

  const config = workflow.triggerConfig as { listId?: string };
  if (config.listId && config.listId !== listId) return { workflowId, triggered: 0, errors: 0 };

  const started = await safeStartRun(workflowId, orgId, contactId, { triggerListId: listId });
  return { workflowId, triggered: started ? 1 : 0, errors: 0 };
}

/**
 * Called when a contact is added to a list — fires all matching workflows for the org.
 */
export async function onListSubscribe(
  orgId: string,
  contactId: string,
  listId: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'list_subscribe'),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map((w) => fireListSubscribeTrigger(w.id, orgId, contactId, listId)),
  );
}

// ─── Trigger: tag_added ───────────────────────────────────────────────────────

/**
 * Called when a tag is assigned to a contact.
 * config: { tagName: string }
 */
export async function onTagAdded(orgId: string, contactId: string, tagName: string): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'tag_added'),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { tagName?: string };
      if (!config.tagName || config.tagName === tagName) {
        await safeStartRun(w.id, orgId, contactId, { triggerTag: tagName });
      }
    }),
  );
}

// ─── Trigger: api_event ───────────────────────────────────────────────────────

/**
 * Called when a custom event is tracked via POST /api/v1/events.
 * config: { eventName: string }
 */
export async function onApiEvent(
  orgId: string,
  contactId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'api_event'),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { eventName?: string };
      if (!config.eventName || config.eventName === eventName) {
        await safeStartRun(w.id, orgId, contactId, { triggerEvent: eventName, ...properties });
      }
    }),
  );
}

/**
 * Start all active workflows of a given trigger type for a contact. Used for
 * first-class e-commerce triggers (purchase_event) that aren't eventName-matched.
 */
async function startTypedWorkflows(
  orgId: string,
  contactId: string,
  triggerType: 'purchase_event',
  data: Record<string, unknown>,
): Promise<void> {
  const wfs = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, triggerType),
        isNull(workflows.deletedAt),
      ),
    );
  await Promise.allSettled(wfs.map((w) => safeStartRun(w.id, orgId, contactId, data)));
}

/**
 * E-commerce first-class triggers. Each fires the matching `api_event`
 * workflow (by eventName) so a metric-triggered flow works, and `order_placed`
 * additionally starts dedicated `purchase_event` workflows (previously a dead
 * enum value nothing fired). These unlock Klaviyo-style Placed-Order,
 * Checkout-Started (abandoned checkout) and Added-to-Cart flows.
 */
export async function onOrderPlaced(
  orgId: string,
  contactId: string,
  order: Record<string, unknown> = {},
): Promise<void> {
  await onApiEvent(orgId, contactId, 'order_placed', order);
  await startTypedWorkflows(orgId, contactId, 'purchase_event', {
    triggerEvent: 'order_placed',
    ...order,
  });
}

export async function onCheckoutStarted(
  orgId: string,
  contactId: string,
  checkout: Record<string, unknown> = {},
): Promise<void> {
  await onApiEvent(orgId, contactId, 'checkout_started', checkout);
}

export async function onAddedToCart(
  orgId: string,
  contactId: string,
  cart: Record<string, unknown> = {},
): Promise<void> {
  await onApiEvent(orgId, contactId, 'added_to_cart', cart);
}

/**
 * Segment membership triggers — fired by the segment-membership cron when a
 * contact newly matches (entered) or stops matching (exited) a segment.
 * Matches workflows of the type whose triggerConfig.segmentId equals the
 * segment (or is unset = any segment). Klaviyo's most-used automation entry.
 */
async function fireSegmentTrigger(
  orgId: string,
  contactId: string,
  segmentId: string,
  triggerType: 'segment_entered' | 'segment_exited',
): Promise<void> {
  const wfs = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, triggerType),
        isNull(workflows.deletedAt),
      ),
    );
  await Promise.allSettled(
    wfs.map(async (w) => {
      const cfg = w.triggerConfig as { segmentId?: string };
      if (!cfg.segmentId || cfg.segmentId === segmentId) {
        await safeStartRun(w.id, orgId, contactId, { triggerEvent: triggerType, segmentId });
      }
    }),
  );
}

export function onSegmentEntered(orgId: string, contactId: string, segmentId: string): Promise<void> {
  return fireSegmentTrigger(orgId, contactId, segmentId, 'segment_entered');
}

export function onSegmentExited(orgId: string, contactId: string, segmentId: string): Promise<void> {
  return fireSegmentTrigger(orgId, contactId, segmentId, 'segment_exited');
}

// ─── Trigger: date_field (cron-based) ────────────────────────────────────────

/**
 * Run daily to check date-field triggers (birthdays, anniversaries).
 * config: { field: string, offset_days?: number }
 *   field: custom field name (e.g. "birthday")
 *   offset_days: send N days before/after the date (0 = exact match)
 */
export async function processDailyDateTriggers(): Promise<{ triggered: number }> {
  const activeWorkflows = await db
    .select({ id: workflows.id, orgId: workflows.orgId, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'date_field'),
        isNull(workflows.deletedAt),
      ),
    );

  let total = 0;
  const today = new Date();
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (const workflow of activeWorkflows) {
    const config = workflow.triggerConfig as { field?: string; offsetDays?: number };
    if (!config.field) continue;

    // Find contacts where custom_fields->>field ends with today's MM-DD
    const contactRows = await db.execute(
      sql`
        SELECT id FROM contacts
        WHERE org_id = ${workflow.orgId}
          AND deleted_at IS NULL
          AND custom_fields->>${config.field} IS NOT NULL
          AND TO_CHAR(
            (custom_fields->>${config.field})::date
            + INTERVAL '${sql.raw(String(config.offsetDays ?? 0))} days',
            'MM-DD'
          ) = ${mmdd}
      `,
    );

    for (const row of contactRows as unknown as Array<{ id: string }>) {
      const started = await safeStartRun(workflow.id, workflow.orgId, row.id, {
        triggerField: config.field,
        triggerDate: today.toISOString().slice(0, 10),
      });
      if (started) total++;
    }
  }

  return { triggered: total };
}

// ─── Trigger: name_day_today (#360/#384) ─────────────────────────────────────

/**
 * Run daily to fire workflows whose trigger type is `name_day_today`.
 *
 * For each active workflow of this type, we resolve the set of name-day names
 * for today in the Czech civil calendar and find contacts whose first_name
 * matches (case- and diacritic-insensitive). Workflow config currently
 * supports only CZ; SK calendar lands with #361.
 *
 * config: { locale?: 'cs' | 'sk' } — defaults to 'cs' (launch market)
 */
export async function processDailyNameDayTriggers(): Promise<{ triggered: number }> {
  const activeWorkflows = await db
    .select({
      id: workflows.id,
      orgId: workflows.orgId,
      triggerConfig: workflows.triggerConfig,
    })
    .from(workflows)
    .where(
      and(
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'name_day_today'),
        isNull(workflows.deletedAt),
      ),
    );

  if (activeWorkflows.length === 0) return { triggered: 0 };

  const today = new Date();
  let total = 0;

  for (const workflow of activeWorkflows) {
    const config = (workflow.triggerConfig ?? {}) as { locale?: string };
    const locale = config.locale === 'sk' ? 'sk' : 'cs';
    const names = locale === 'sk' ? nameDaysSk(today) : nameDaysCs(today);
    if (names.length === 0) continue;

    // Normalized comparison values for SQL — lowercase + diacritics stripped
    // via Postgres `unaccent` (pre-normalize on the JS side to match).
    const normalizedNames = names.map((n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());

    const contactRows = await db.execute(
      sql`
        SELECT id FROM contacts
        WHERE org_id = ${workflow.orgId}
          AND deleted_at IS NULL
          AND first_name IS NOT NULL
          AND lower(unaccent(first_name)) = ANY(${normalizedNames})
      `,
    );

    for (const row of contactRows as unknown as Array<{ id: string }>) {
      const started = await safeStartRun(workflow.id, workflow.orgId, row.id, {
        triggerType: 'name_day_today',
        triggerDate: today.toISOString().slice(0, 10),
        locale,
        names,
      });
      if (started) total++;
    }
  }

  return { triggered: total };
}

// ─── Trigger: n_days_before_holiday (#389) ──────────────────────────────────

/**
 * Run daily to fire workflows whose trigger type is `n_days_before_holiday`.
 *
 * Resolves the set of CZ/SK public holidays that fall exactly `daysAhead`
 * after today. If a workflow's optional `holidayKeys` filter matches (or no
 * filter is set), the workflow runs for every active contact in the org —
 * optionally restricted to a `listId`.
 *
 * config: {
 *   locale?: 'cs' | 'sk',         // default 'cs'
 *   daysAhead?: number,           // default 0 (= today)
 *   holidayKeys?: string[],       // optional whitelist (e.g. ['12-24', 'EASTER+1'])
 *   listId?: string,              // optional contact-list scope
 * }
 */
export async function processDailyHolidayTriggers(
  now: Date = new Date(),
): Promise<{ triggered: number }> {
  const activeWorkflows = await db
    .select({
      id: workflows.id,
      orgId: workflows.orgId,
      triggerConfig: workflows.triggerConfig,
    })
    .from(workflows)
    .where(
      and(
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'n_days_before_holiday'),
        isNull(workflows.deletedAt),
      ),
    );

  if (activeWorkflows.length === 0) return { triggered: 0 };

  let total = 0;

  for (const workflow of activeWorkflows) {
    const config = (workflow.triggerConfig ?? {}) as {
      locale?: 'cs' | 'sk';
      daysAhead?: number;
      holidayKeys?: string[];
      listId?: string;
    };
    const locale = config.locale === 'sk' ? 'sk' : 'cs';
    const daysAhead = Math.max(0, Math.floor(Number(config.daysAhead ?? 0)));

    const holidays =
      locale === 'sk' ? slovakHolidaysInDays(now, daysAhead) : czechHolidaysInDays(now, daysAhead);
    if (holidays.length === 0) continue;

    const matching =
      config.holidayKeys && config.holidayKeys.length > 0
        ? holidays.filter((h) => config.holidayKeys!.includes(h.key))
        : holidays;
    if (matching.length === 0) continue;

    const contactRows = config.listId
      ? await db.execute(
          sql`
            SELECT cl.contact_id AS id
            FROM contact_lists cl
            JOIN contacts c ON c.id = cl.contact_id
            WHERE cl.list_id = ${config.listId}
              AND c.org_id = ${workflow.orgId}
              AND c.deleted_at IS NULL
              AND c.status = 'active'
          `,
        )
      : await db.execute(
          sql`
            SELECT id FROM contacts
            WHERE org_id = ${workflow.orgId}
              AND deleted_at IS NULL
              AND status = 'active'
          `,
        );

    for (const holiday of matching) {
      for (const row of contactRows as unknown as Array<{ id: string }>) {
        const started = await safeStartRun(workflow.id, workflow.orgId, row.id, {
          triggerType: 'n_days_before_holiday',
          holidayDate: holiday.date,
          holidayName: holiday.name,
          holidayKey: holiday.key,
          locale,
          daysAhead,
        });
        if (started) total++;
      }
    }
  }

  return { triggered: total };
}

// ─── Trigger: manual ─────────────────────────────────────────────────────────

/**
 * Manually start a workflow run for a specific contact (e.g. from the UI).
 */
export async function triggerManual(
  workflowId: string,
  orgId: string,
  contactId: string,
): Promise<WorkflowRun> {
  return startWorkflowRun(workflowId, orgId, contactId, { triggerType: 'manual' });
}

// ─── CRM deal triggers (#185) ────────────────────────────────────────────────

/**
 * Named helpers for CRM deal events — all route through api_event so existing
 * workflow configurations with triggerType='api_event' work without migration.
 */
export async function onDealStageChanged(
  orgId: string,
  contactId: string,
  dealId: string,
  fromStageId: string | null,
  toStageId: string,
  probability: number,
): Promise<void> {
  await onApiEvent(orgId, contactId, 'deal_stage_changed', {
    dealId,
    fromStageId,
    toStageId,
    probability,
  });
}

export async function onDealCreated(
  orgId: string,
  contactId: string,
  dealId: string,
  value: number,
  stageId: string,
): Promise<void> {
  await onApiEvent(orgId, contactId, 'deal_created', { dealId, value, stageId });
}

export async function onDealWon(
  orgId: string,
  contactId: string,
  dealId: string,
  value: number,
): Promise<void> {
  await onApiEvent(orgId, contactId, 'deal_won', { dealId, value });
}

export async function onDealLost(
  orgId: string,
  contactId: string,
  dealId: string,
  reason: string,
): Promise<void> {
  await onApiEvent(orgId, contactId, 'deal_lost', { dealId, reason });
}

/**
 * Periodic job — fire 'deal_stale' for any open deal whose stage hasn't changed
 * in longer than `thresholdHours` (default 72 h).
 * Uses Redis to debounce: each deal fires at most once per 24 h.
 */
export async function processStaleDealTriggers(
  opts: {
    orgId?: string;
    thresholdHours?: number;
    limit?: number;
  } = {},
): Promise<{ fired: number }> {
  const thresholdHours = opts.thresholdHours ?? 72;
  const limit = opts.limit ?? 500;

  // Build base conditions
  const baseConditions = and(
    eq(deals.status, 'open' as const),
    isNull(deals.deletedAt),
    lt(deals.stageChangedAt, sql`NOW() - (${thresholdHours} * INTERVAL '1 hour')`),
    ...(opts.orgId ? [eq(deals.orgId, opts.orgId)] : []),
  );

  const staleDeals = await db
    .select({
      id: deals.id,
      orgId: deals.orgId,
      contactId: deals.contactId,
      stageId: deals.stageId,
      stageChangedAt: deals.stageChangedAt,
      value: deals.value,
    })
    .from(deals)
    .where(baseConditions)
    .limit(limit);

  let fired = 0;
  for (const deal of staleDeals) {
    if (!deal.contactId) continue;

    const key = `deal:stale:${deal.id}`;
    const already = await redis.get(key);
    if (already) continue;

    await onApiEvent(deal.orgId, deal.contactId, 'deal_stale', {
      dealId: deal.id,
      stageId: deal.stageId,
      hoursInStage: Math.floor((Date.now() - deal.stageChangedAt.getTime()) / 3_600_000),
      value: Number(deal.value),
    });

    // Debounce: don't re-fire within 24 h
    await redis.set(key, '1', 'EX', 86_400);
    fired++;
  }

  return { fired };
}

// ─── Process unprocessed API events ──────────────────────────────────────────

/**
 * Process any queued workflow events that haven't been handled yet.
 * Called by BullMQ cron every minute.
 */
export async function processQueuedWorkflowEvents(): Promise<{ processed: number }> {
  const pending = await db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.processed, false))
    .limit(200);

  let processed = 0;

  for (const event of pending) {
    try {
      if (event.contactId) {
        await onApiEvent(
          event.orgId,
          event.contactId,
          event.eventName,
          event.properties as Record<string, unknown>,
        );
      }
      await db
        .update(workflowEvents)
        .set({ processed: true })
        .where(eq(workflowEvents.id, event.id));
      processed++;
    } catch {
      // leave unprocessed — will retry next tick
    }
  }

  return { processed };
}

// ─── Loyalty triggers (#239) ──────────────────────────────────────────────────

/**
 * Fire all active workflows with trigger 'loyalty_points_earned' for a contact.
 * config: { programId?: string, minPoints?: number }
 */
export async function onLoyaltyPointsEarned(
  orgId: string,
  contactId: string,
  programId: string,
  pointsEarned: number,
  newBalance: number,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'loyalty_points_earned' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { programId?: string; minPoints?: number };
      if (config.programId && config.programId !== programId) return;
      if (config.minPoints && pointsEarned < config.minPoints) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'loyalty_points_earned',
        programId,
        pointsEarned,
        newBalance,
      });
    }),
  );
}

/**
 * Fire all active workflows with trigger 'loyalty_tier_up' for a contact.
 * config: { programId?: string, tierId?: string }
 */
export async function onLoyaltyTierUp(
  orgId: string,
  contactId: string,
  programId: string,
  newTierId: string,
  tierName: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'loyalty_tier_up' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { programId?: string; tierId?: string };
      if (config.programId && config.programId !== programId) return;
      if (config.tierId && config.tierId !== newTierId) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'loyalty_tier_up',
        programId,
        newTierId,
        tierName,
      });
    }),
  );
}

/**
 * Fire all active workflows with trigger 'loyalty_reward_redeemed' for a contact.
 * config: { programId?: string, rewardId?: string }
 */
export async function onLoyaltyRewardRedeemed(
  orgId: string,
  contactId: string,
  programId: string,
  rewardId: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'loyalty_reward_redeemed' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { programId?: string; rewardId?: string };
      if (config.programId && config.programId !== programId) return;
      if (config.rewardId && config.rewardId !== rewardId) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'loyalty_reward_redeemed',
        programId,
        rewardId,
      });
    }),
  );
}

// ─── GDPR consent triggers ────────────────────────────────────────────────────

/**
 * Fire all active workflows with trigger 'consent_granted'.
 * config: { purposeId?: string }  — optional filter by specific purpose.
 *
 * Called from grantConsent() in the GDPR service.
 */
export async function onConsentGranted(
  orgId: string,
  contactId: string,
  purposeId: string,
  purposeSlug: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'consent_granted' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { purposeId?: string };
      if (config.purposeId && config.purposeId !== purposeId) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'consent_granted',
        purposeId,
        purposeSlug,
      });
    }),
  );
}

/**
 * Fire all active workflows with trigger 'consent_revoked'.
 * config: { purposeId?: string }
 *
 * Called from revokeConsent() in the GDPR service.
 */
export async function onConsentRevoked(
  orgId: string,
  contactId: string,
  purposeId: string,
  purposeSlug: string,
  reason?: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'consent_revoked' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { purposeId?: string };
      if (config.purposeId && config.purposeId !== purposeId) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'consent_revoked',
        purposeId,
        purposeSlug,
        reason,
      });
    }),
  );
}

/**
 * Fire all active workflows with trigger 'consent_expired'.
 * Called nightly by the expireStaleConsents() cron job after marking records expired.
 *
 * config: { purposeId?: string }
 */
export async function onConsentExpired(
  orgId: string,
  contactId: string,
  purposeId: string,
  purposeSlug: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'consent_expired' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { purposeId?: string };
      if (config.purposeId && config.purposeId !== purposeId) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'consent_expired',
        purposeId,
        purposeSlug,
      });
    }),
  );
}

/**
 * Fire workflows triggered by company events (#322).
 * eventType: 'company_enriched' | 'company_deal_won' | 'company_arr_threshold'
 * config: { eventType?: string; threshold?: number }
 */
export async function onCompanyEvent(
  orgId: string,
  contactId: string,
  eventType: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'company_event' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { eventType?: string; threshold?: number };
      if (config.eventType && config.eventType !== eventType) return;
      if (config.threshold && eventType === 'company_arr_threshold') {
        const arr = data['annualRevenueUsd'] as number | undefined;
        if (!arr || arr < config.threshold) return;
      }
      await safeStartRun(w.id, orgId, contactId, { triggerType: 'company_event', eventType, ...data });
    }),
  );
}

/**
 * Fire workflows triggered by helpdesk ticket events (#323).
 * eventType: 'ticket_created' | 'ticket_sla_breached' | 'ticket_reopened' | 'ticket_resolved'
 * config: { eventType?: string; priority?: string }
 */
export async function onTicketEvent(
  orgId: string,
  contactId: string,
  ticketId: string,
  eventType: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'ticket_event' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { eventType?: string; priority?: string };
      if (config.eventType && config.eventType !== eventType) return;
      if (config.priority && data['priority'] !== config.priority) return;
      await safeStartRun(w.id, orgId, contactId, { triggerType: 'ticket_event', ticketId, eventType, ...data });
    }),
  );
}

/**
 * Fire workflows triggered by a tracked email link click (#481).
 * config: { urlPattern?: string } — optional substring match on the clicked URL.
 */
export async function onEmailLinkClick(
  orgId: string,
  contactId: string,
  campaignId: string,
  clickedUrl: string,
): Promise<void> {
  const activeWorkflows = await db
    .select({ id: workflows.id, triggerConfig: workflows.triggerConfig })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'email_link_click' as never),
        isNull(workflows.deletedAt),
      ),
    );

  await Promise.allSettled(
    activeWorkflows.map(async (w) => {
      const config = w.triggerConfig as { urlPattern?: string; campaignId?: string };
      if (config.campaignId && config.campaignId !== campaignId) return;
      if (config.urlPattern && !clickedUrl.includes(config.urlPattern)) return;
      await safeStartRun(w.id, orgId, contactId, {
        triggerType: 'email_link_click',
        campaignId,
        clickedUrl,
      });
    }),
  );
}

// ─── Blog post publish (#337) ─────────────────────────────────────────────────

/**
 * Called when a blog post is published. Fires the `new_blog_post_published`
 * api_event trigger for all opted-in contacts in the org, and enqueues an RSS
 * campaign dispatch if the org has a blog-linked RSS campaign configured.
 */
export async function onNewBlogPost(
  orgId: string,
  post: { id: string; title: string; slug: string; excerpt?: string | null },
): Promise<void> {
  // 1. Find workflows listening for new_blog_post_published api_event
  const activeWorkflows = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(
        eq(workflows.orgId, orgId),
        eq(workflows.status, 'active'),
        eq(workflows.triggerType, 'api_event' as never),
        isNull(workflows.deletedAt),
      ),
    );

  const blogWorkflows = activeWorkflows.filter((w) => {
    const cfg = (w as unknown as { triggerConfig: { eventName?: string } }).triggerConfig;
    return cfg?.eventName === 'new_blog_post_published';
  });

  if (blogWorkflows.length > 0) {
    // Fire for all active (non-unsubscribed) contacts in org
    const orgContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.status, 'active' as never),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(5000);

    for (const wf of blogWorkflows) {
      await Promise.allSettled(
        orgContacts.map((c) =>
          safeStartRun(wf.id, orgId, c.id, {
            triggerType: 'api_event',
            eventName: 'new_blog_post_published',
            blogPostId: post.id,
            blogPostTitle: post.title,
            blogPostSlug: post.slug,
          }),
        ),
      );
    }
  }

  // 2. Enqueue RSS campaigns linked to blog (feedUrl = 'blog://internal')
  const blogRssCampaigns = await db
    .select()
    .from(rssCampaigns)
    .where(
      and(
        eq(rssCampaigns.orgId, orgId),
        eq(rssCampaigns.active, true),
        eq(rssCampaigns.feedUrl, 'blog://internal'),
      ),
    );

  if (blogRssCampaigns.length > 0) {
    // Defer to RSS campaign worker via redis queue
    for (const rss of blogRssCampaigns) {
      await redis
        .lpush(
          'queue:rss_campaign_dispatch',
          JSON.stringify({ rssCampaignId: rss.id, blogPostId: post.id }),
        )
        .catch(() => {});
    }
  }
}
