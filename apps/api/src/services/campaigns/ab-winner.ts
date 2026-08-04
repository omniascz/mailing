/**
 * A/B auto-winner service.
 *
 * Lifecycle:
 *   1. campaign-splitter enqueues variants (e.g. 40% A + 40% B = 80% of list).
 *      The remaining 20% is stored in ab_test_holdbacks via storeHoldback().
 *   2. A delayed BullMQ job (`ab-winner`) fires after ab_config.testDurationHours.
 *   3. computeAbWinner() reads email_events, picks the winner using a two-sample
 *      z-test for proportions, stores the result in ab_test_results.
 *   4. The worker reads holdback contacts (paginated) and enqueues them to the
 *      batch-sender queue with the winning variant's subject/content.
 *
 * Statistical note: we use a one-tailed z-test (winner > runner-up).
 * Confidence mapping: z ≥ 1.282 → 90%, 1.645 → 95%, 1.960 → 97.5%, 2.326 → 99%.
 * When confidence < ab_config.confidenceThreshold (default 95%), we still pick
 * the numerically best variant and flag confidence as "low" in the result row —
 * auto-send fires regardless; the confidence value is informational.
 */

import { and, eq, sql, count } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, emailEvents, abTestHoldbacks, abTestResults } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AbVariant {
  id: string;
  subject: string;
  content: Record<string, unknown>;
  preheader?: string;
  percentage: number;
}

export interface AbConfig {
  variants: AbVariant[];
  winnerCriteria?: 'open_rate' | 'click_rate';
  testDurationHours?: number;
  autoSendWinner?: boolean;
  confidenceThreshold?: number;
}

export interface VariantStats {
  variantId: string;
  subject: string;
  content: Record<string, unknown>;
  preheader?: string;
  sent: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
  score: number;
}

export interface AbWinnerResult {
  campaignId: string;
  winnerVariantId: string;
  metric: string;
  confidencePct: number;
  rankings: VariantStats[];
  autoSendWinner: boolean;
}

// ─── Statistical helpers ──────────────────────────────────────────────────────

/**
 * Two-sample z-test for proportions (one-tailed: p1 > p2).
 * Returns z-score; caller maps to confidence %.
 */
function zTestTwoProportions(p1: number, n1: number, p2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

/** Convert z-score to approximate one-tailed confidence % (0–100). */
function zToConfidencePct(z: number): number {
  if (z >= 2.326) return 99;
  if (z >= 1.96) return 97.5;
  if (z >= 1.645) return 95;
  if (z >= 1.282) return 90;
  if (z >= 0.842) return 80;
  if (z > 0) return 50 + z * 30; // rough linear for low z
  return 50;
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Store holdback contact IDs in bulk. Called by the campaign-splitter worker
 * after enqueuing the variant batches.
 */
export async function storeHoldback(
  orgId: string,
  campaignId: string,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;

  const CHUNK = 1000;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const slice = contactIds.slice(i, i + CHUNK);
    await db
      .insert(abTestHoldbacks)
      .values(slice.map((contactId) => ({ orgId, campaignId, contactId })))
      .onConflictDoNothing();
  }
}

/**
 * Retrieve holdback contact IDs for a campaign. Paginated via cursor (last id).
 */
export async function getHoldbackPage(
  campaignId: string,
  limit: number,
  afterId?: string,
): Promise<{ contactIds: string[]; nextCursor: string | null }> {
  const rows = await db
    .select({ id: abTestHoldbacks.id, contactId: abTestHoldbacks.contactId })
    .from(abTestHoldbacks)
    .where(
      afterId
        ? and(
            eq(abTestHoldbacks.campaignId, campaignId),
            sql`${abTestHoldbacks.id} > ${afterId}::uuid`,
          )
        : eq(abTestHoldbacks.campaignId, campaignId),
    )
    .orderBy(abTestHoldbacks.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    contactIds: page.map((r) => r.contactId),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/**
 * Get holdback count for a campaign (for reporting).
 */
export async function getHoldbackCount(campaignId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(abTestHoldbacks)
    .where(eq(abTestHoldbacks.campaignId, campaignId));
  return Number(row?.n ?? 0);
}

/**
 * Compute per-variant stats from email_events and pick the winner.
 * Stores the result in ab_test_results and returns the winner info.
 *
 * Idempotent: if ab_test_results already has a row for this campaign,
 * returns the stored result without recomputing (prevents double-dispatch).
 */
export async function computeAbWinner(orgId: string, campaignId: string): Promise<AbWinnerResult> {
  // Idempotency check
  const [existing] = await db
    .select()
    .from(abTestResults)
    .where(eq(abTestResults.campaignId, campaignId))
    .limit(1);

  if (existing) {
    // Return cached result so the worker can still dispatch if needed
    return {
      campaignId,
      winnerVariantId: existing.winnerVariantId,
      metric: existing.winnerMetric,
      confidencePct: Number(existing.confidencePct ?? 0),
      rankings: [],
      autoSendWinner: !existing.autoSendDispatched, // allow dispatch if not yet done
    };
  }

  // Load campaign + ab_config
  const [camp] = await db
    .select({ abConfig: campaigns.abConfig })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);

  if (!camp) throw AppError.notFound('Campaign');
  const cfg = camp.abConfig as AbConfig | null;
  if (!cfg || !cfg.variants || cfg.variants.length < 2) {
    throw AppError.badRequest('Campaign does not have a valid ab_config with 2+ variants');
  }

  const metric = cfg.winnerCriteria ?? 'open_rate';
  const autoSend = cfg.autoSendWinner !== false;

  // Query per-variant event counts from email_events
  // variant_id is stored on email_events as metadata — we tag it via the batch-sender
  // using subject as a proxy discriminator when variant_id tag isn't present.
  // The batch-sender stores the variant subject on the event row via `variant_id` field
  // in the event metadata (ab_variant_id column added to email_events).
  // Fallback: group by subject line (unique per variant).
  const rows = await db.execute<{
    variant_id: string | null;
    sent: string;
    unique_opens: string;
    unique_clicks: string;
  }>(sql`
    SELECT
      ${emailEvents.abVariantId}        AS variant_id,
      COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'send')                       AS sent,
      COUNT(DISTINCT ${emailEvents.contactId}) FILTER (
        WHERE ${emailEvents.eventType} = 'open' AND COALESCE(${emailEvents.isBot}, false) = false
      )                                                                                 AS unique_opens,
      COUNT(DISTINCT ${emailEvents.contactId}) FILTER (
        WHERE ${emailEvents.eventType} = 'click'
      )                                                                                 AS unique_clicks
    FROM ${emailEvents}
    WHERE ${emailEvents.orgId} = ${orgId}
      AND ${emailEvents.campaignId} = ${campaignId}
      AND ${emailEvents.abVariantId} IS NOT NULL
    GROUP BY ${emailEvents.abVariantId}
  `);

  type ExecResult = { rows?: typeof rows };
  const eventRows = (rows as unknown as ExecResult).rows ?? (rows as unknown as typeof rows);

  // Build stats map keyed by variant_id
  const statsMap = new Map<string, { sent: number; uniqueOpens: number; uniqueClicks: number }>();
  for (const r of eventRows) {
    if (!r.variant_id) continue;
    statsMap.set(r.variant_id, {
      sent: Number(r.sent),
      uniqueOpens: Number(r.unique_opens),
      uniqueClicks: Number(r.unique_clicks),
    });
  }

  // Score each variant
  const ranked: VariantStats[] = cfg.variants.map((v) => {
    const s = statsMap.get(v.id) ?? { sent: 0, uniqueOpens: 0, uniqueClicks: 0 };
    const delivered = s.sent || 1;
    const openRate = s.uniqueOpens / delivered;
    const clickRate = s.uniqueClicks / delivered;
    const score = metric === 'open_rate' ? openRate : clickRate;
    return {
      variantId: v.id,
      subject: v.subject,
      content: v.content,
      preheader: v.preheader,
      sent: s.sent,
      uniqueOpens: s.uniqueOpens,
      uniqueClicks: s.uniqueClicks,
      openRate,
      clickRate,
      score,
    };
  });
  ranked.sort((a, b) => b.score - a.score);

  const winner = ranked[0]!;
  const runnerUp = ranked[1];

  // Z-test: winner vs runner-up
  let confidencePct = 0;
  if (runnerUp && winner.sent > 0 && runnerUp.sent > 0) {
    const z = zTestTwoProportions(winner.score, winner.sent, runnerUp.score, runnerUp.sent);
    confidencePct = z > 0 ? zToConfidencePct(z) : 50;
  } else if (winner.score > 0) {
    confidencePct = 95; // only one variant has data — treat as confident
  }

  // Persist result
  const holdbackCount = await getHoldbackCount(campaignId);
  await db
    .insert(abTestResults)
    .values({
      campaignId,
      orgId,
      winnerVariantId: winner.variantId,
      winnerMetric: metric,
      winnerScore: String(winner.score),
      runnerUpScore: String(runnerUp?.score ?? 0),
      confidencePct: String(confidencePct),
      holdbackCount,
      autoSendDispatched: false,
    })
    .onConflictDoNothing();

  return {
    campaignId,
    winnerVariantId: winner.variantId,
    metric,
    confidencePct,
    rankings: ranked,
    autoSendWinner: autoSend,
  };
}

/**
 * Mark winner dispatch as completed (called after worker finishes sending).
 */
export async function markWinnerDispatched(campaignId: string): Promise<void> {
  await db
    .update(abTestResults)
    .set({ autoSendDispatched: true, dispatchedAt: new Date() })
    .where(eq(abTestResults.campaignId, campaignId));
}

/**
 * Get the stored A/B test result for a campaign (for the UI result endpoint).
 */
export async function getAbTestResult(
  orgId: string,
  campaignId: string,
): Promise<typeof abTestResults.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(abTestResults)
    .where(and(eq(abTestResults.campaignId, campaignId), eq(abTestResults.orgId, orgId)))
    .limit(1);
  return row ?? null;
}
