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
 * Statistics: two-sample z-test for proportions, TWO-tailed. The winner is
 * chosen by ranking the observed data, so the direction of the comparison comes
 * from the data too — a one-tailed test on a direction picked that way roughly
 * halves the p-value and overstates the result. Confidence comes from the normal
 * CDF, not a table of thresholds.
 *
 * When confidence falls below ab_config.confidenceThreshold (default 95) the
 * winner is NOT auto-sent. The result row records `decision = 'needs_review'`
 * with a reason and the campaign is paused for a human. This mirrors
 * services/multivariate-tests/index.ts, which has always gated on its own
 * threshold — two mechanisms for the same thing in one product should not
 * behave differently.
 *
 * Known and deliberately not addressed here: with more than two variants only
 * the top two are compared and no multiple-comparison correction is applied, so
 * taking the maximum over k arms inflates confidence as k grows. Bonferroni /
 * Šidák, and Fisher's exact test for small samples, are improvements rather
 * than repairs to a broken calculation, and belong in their own change.
 */

import { and, eq, sql, count } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, abTestHoldbacks, abTestResults } from '../../db/schema/index.js';
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
  winnerCriteria?: WinnerCriteria;
  testDurationHours?: number;
  autoSendWinner?: boolean;
  /** Percent, 0-100. Below this the winner is not dispatched automatically. */
  confidenceThreshold?: number;
}

export type WinnerCriteria = 'open_rate' | 'click_rate';

/**
 * What a test is judged on when ab_config does not say.
 *
 * click_rate, not open_rate. Apple Mail Privacy Protection pre-fetches the
 * tracking pixel from a proxy, so a share of "opens" is a machine that was
 * never a reader — and the share differs by audience, which makes open rate
 * systematically biased in a way that does not cancel out between variants.
 * A click needs a person. open_rate stays available for tests where the
 * subject line is the whole point and nothing in the body is clickable.
 *
 * Read from here everywhere; the default must not be spelled out per call site.
 */
export const DEFAULT_WINNER_CRITERIA: WinnerCriteria = 'click_rate';

/** Confidence a winner must reach before it is dispatched without a human. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 95;

/** What computeAbWinner decided to do about dispatching. */
export type AbDecision = 'auto_send' | 'needs_review';

export interface VariantStats {
  variantId: string;
  subject: string;
  content: Record<string, unknown>;
  preheader?: string;
  /** Distinct contacts with a `send` row for this variant. The denominator. */
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
  /** Variants with at least one send, best first. Never empty when a winner exists. */
  rankings: VariantStats[];
  /** True only when the worker should dispatch the holdback without asking. */
  autoSendWinner: boolean;
  decision: AbDecision;
  /** Why a human is needed, when decision is 'needs_review'. */
  decisionReason: string | null;
}

// ─── Statistical helpers ──────────────────────────────────────────────────────

/**
 * Two-sample z-test for proportions. Returns the z-score; sign is p1 − p2.
 */
export function zTestTwoProportions(p1: number, n1: number, p2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

/**
 * Standard normal CDF, via the Abramowitz & Stegun 7.1.26 approximation of erf.
 * Absolute error < 1.5e-7, which is far below anything that changes a decision.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Two-tailed confidence that the two proportions differ, as a percentage.
 *
 * Two-tailed rather than one-tailed because the direction under test — "the
 * variant that came out on top is the better one" — is chosen by looking at the
 * data. A one-tailed p-value is only honest when the direction was fixed in
 * advance; used here it would halve the p-value and report roughly 95% where
 * the evidence supports about 90%.
 *
 * The old implementation was a staircase of hard-coded thresholds (z ≥ 1.96 →
 * 97.5, z ≥ 1.645 → 95 …) with an invented `50 + z * 30` branch underneath, and
 * a discontinuity at z = 0.842 where it jumped from 75.3 to 80. This is the
 * actual distribution instead.
 */
export function zToConfidencePct(z: number): number {
  const pTwoTailed = 2 * (1 - normalCdf(Math.abs(z)));
  return Math.max(0, Math.min(100, (1 - pTwoTailed) * 100));
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
 * Per-variant statistics, counted by joining later events back to the send row.
 *
 * The obvious query — group open/click rows by their own `ab_variant_id` — was
 * what shipped, and it returned zeros forever: opens and clicks never carried a
 * variant, and the query filtered on `ab_variant_id IS NOT NULL`, so every
 * engagement row was discarded and every variant scored 0. With all scores
 * equal the sort was a no-op and the "winner" was simply `variants[0]`.
 * Measured: variant B with four times the opens lost when it was listed second,
 * and won when the same config listed it first.
 *
 * Attribution on the open/click row is now written (see variant-attribution.ts),
 * but this does not depend on it. The send row is the source of truth, so the
 * count is right for data recorded before that change, and right again if an
 * attribution write is ever missed. That is the whole reason for the join.
 *
 * `sent` is the assignment cohort: distinct contacts with a `send` row for the
 * variant. Not `deliver` — in this codebase mta-sender writes `send` only after
 * SMTP returns 250, so a send here already means delivered, and using `deliver`
 * would shrink the denominator whenever that second write is the one that
 * failed. If a transport is ever added that acknowledges before delivery, this
 * is the line to revisit.
 */
async function variantStats(
  orgId: string,
  campaignId: string,
): Promise<Map<string, { sent: number; uniqueOpens: number; uniqueClicks: number }>> {
  const rows = await db.execute<{
    variant_id: string;
    sent: string;
    unique_opens: string;
    unique_clicks: string;
  }>(sql`
    WITH assigned AS (
      SELECT DISTINCT ON (se."contact_id")
             se."contact_id"    AS contact_id,
             se."ab_variant_id" AS variant_id
      FROM "email_events" se
      WHERE se."org_id" = ${orgId}::uuid
        AND se."campaign_id" = ${campaignId}::uuid
        AND se."event_type" = 'send'
        AND se."ab_variant_id" IS NOT NULL
    )
    SELECT
      a.variant_id                                       AS variant_id,
      COUNT(DISTINCT a.contact_id)                       AS sent,
      COUNT(DISTINCT ev."contact_id") FILTER (
        WHERE ev."event_type" = 'open'
          AND COALESCE(ev."is_bot", false) = false
      )                                                  AS unique_opens,
      COUNT(DISTINCT ev."contact_id") FILTER (
        WHERE ev."event_type" = 'click'
      )                                                  AS unique_clicks
    FROM assigned a
    LEFT JOIN "email_events" ev
      ON ev."campaign_id" = ${campaignId}::uuid
     AND ev."contact_id" = a.contact_id
    GROUP BY a.variant_id
  `);

  type ExecResult = { rows?: typeof rows };
  const list = (rows as unknown as ExecResult).rows ?? (rows as unknown as typeof rows);

  const out = new Map<string, { sent: number; uniqueOpens: number; uniqueClicks: number }>();
  for (const r of list) {
    if (!r.variant_id) continue;
    out.set(r.variant_id, {
      sent: Number(r.sent),
      uniqueOpens: Number(r.unique_opens),
      uniqueClicks: Number(r.unique_clicks),
    });
  }
  return out;
}

/** Load ab_config, or throw if the campaign is not a valid A/B test. */
async function loadAbConfig(orgId: string, campaignId: string): Promise<AbConfig> {
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
  return cfg;
}

/**
 * Rebuild rankings from ab_config for the cached path.
 *
 * The worker takes the winning variant's `subject`, `content` and `preheader`
 * from here to build its batch jobs; it does not read the counts. Those come
 * back as zero rather than as a re-derived guess, so nothing downstream
 * mistakes them for a fresh measurement.
 */
function rankingsFromConfig(cfg: AbConfig, winnerVariantId: string): VariantStats[] {
  const blank = (v: AbVariant): VariantStats => ({
    variantId: v.id,
    subject: v.subject,
    content: v.content,
    preheader: v.preheader,
    sent: 0,
    uniqueOpens: 0,
    uniqueClicks: 0,
    openRate: 0,
    clickRate: 0,
    score: 0,
  });
  const winner = cfg.variants.find((v) => v.id === winnerVariantId);
  const rest = cfg.variants.filter((v) => v.id !== winnerVariantId);
  return [...(winner ? [blank(winner)] : []), ...rest.map(blank)];
}

/**
 * Whether the winner may go out to the holdback without a human looking first.
 *
 * Same shape as selectWinner() in services/multivariate-tests/index.ts, which
 * has always honoured its own threshold: below it, no winner is selected and
 * the test ends waiting for a decision. `confidenceThreshold` was declared on
 * AbConfig here, documented in the file header, and read by nothing — a control
 * the customer could set that changed nothing at all.
 */
export function decideDispatch(input: {
  confidencePct: number;
  threshold: number;
  hasRunnerUp: boolean;
  autoSendConfigured: boolean;
}): { decision: AbDecision; decisionReason: string | null } {
  if (!input.autoSendConfigured) {
    return {
      decision: 'needs_review',
      decisionReason:
        'Automatic sending of the winner is turned off for this test, so the remaining ' +
        'contacts are waiting for you to choose a variant.',
    };
  }
  if (!input.hasRunnerUp) {
    return {
      decision: 'needs_review',
      decisionReason:
        'Only one variant has any recorded sends, so there is nothing to compare it ' +
        'against and no way to tell whether it actually performed better.',
    };
  }
  if (input.threshold > 0 && input.confidencePct < input.threshold) {
    return {
      decision: 'needs_review',
      decisionReason:
        `The difference between the variants reached ${input.confidencePct.toFixed(1)}% ` +
        `confidence, below the ${input.threshold}% this test requires. The result could ` +
        'be chance, so the remaining contacts have not been sent anything yet.',
    };
  }
  return { decision: 'auto_send', decisionReason: null };
}

/**
 * Compute per-variant stats, pick the winner, and decide whether it may be
 * dispatched without a human. Stores the result in ab_test_results.
 *
 * Idempotent: a second call returns the stored verdict. The cached branch used
 * to return `rankings: []`, which the worker needs for the winning variant's
 * subject and body — so it logged "Winner variant not found in rankings" and
 * dispatched nothing.
 */
export async function computeAbWinner(orgId: string, campaignId: string): Promise<AbWinnerResult> {
  const cfg = await loadAbConfig(orgId, campaignId);
  const metric: WinnerCriteria = cfg.winnerCriteria ?? DEFAULT_WINNER_CRITERIA;

  const [existing] = await db
    .select()
    .from(abTestResults)
    .where(eq(abTestResults.campaignId, campaignId))
    .limit(1);

  if (existing) {
    const decision = (existing.decision as AbDecision | null) ?? 'auto_send';
    return {
      campaignId,
      winnerVariantId: existing.winnerVariantId,
      metric: existing.winnerMetric,
      confidencePct: Number(existing.confidencePct ?? 0),
      rankings: rankingsFromConfig(cfg, existing.winnerVariantId),
      autoSendWinner: decision === 'auto_send' && !existing.autoSendDispatched,
      decision,
      decisionReason: existing.decisionReason ?? null,
    };
  }

  const stats = await variantStats(orgId, campaignId);

  // A variant nobody was sent has no rate to speak of. It used to get a
  // denominator of 1 (`s.sent || 1`), which turned a single stray open into a
  // 100% open rate — "no data" wearing the costume of a perfect result.
  const ranked: VariantStats[] = cfg.variants
    .map((v): VariantStats | null => {
      const s = stats.get(v.id);
      if (!s || s.sent === 0) return null;
      const openRate = s.uniqueOpens / s.sent;
      const clickRate = s.uniqueClicks / s.sent;
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
        score: metric === 'open_rate' ? openRate : clickRate,
      };
    })
    .filter((v): v is VariantStats => v !== null)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    throw AppError.badRequest(
      'No variant of this campaign has any recorded sends, so there is nothing to compare',
    );
  }

  const winner = ranked[0]!;
  const runnerUp = ranked[1];

  // Confidence needs two arms. The old code returned 95% when only one variant
  // had data — asserting near-certainty from a single sample with nothing to
  // compare against, which is the opposite of what one arm tells you.
  const confidencePct = runnerUp
    ? zToConfidencePct(
        zTestTwoProportions(winner.score, winner.sent, runnerUp.score, runnerUp.sent),
      )
    : 0;

  const threshold = cfg.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const { decision, decisionReason } = decideDispatch({
    confidencePct,
    threshold,
    hasRunnerUp: Boolean(runnerUp),
    autoSendConfigured: cfg.autoSendWinner !== false,
  });

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
      decision,
      decisionReason,
    })
    .onConflictDoNothing();

  return {
    campaignId,
    winnerVariantId: winner.variantId,
    metric,
    confidencePct,
    rankings: ranked,
    autoSendWinner: decision === 'auto_send',
    decision,
    decisionReason,
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
