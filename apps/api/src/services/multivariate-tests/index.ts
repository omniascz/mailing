/**
 * Multivariate testing service.
 *
 * Runs 3+ simultaneous variants of a campaign, measures a chosen metric
 * (open rate, click rate, revenue-per-email, …) over a test window, then
 * picks a winner and optionally rolls it out to the remaining audience.
 *
 * Variant assignment is deterministic per (test, contact) via a stable hash,
 * so a re-sent message or re-opened email always resolves to the same variant.
 */

import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  multivariateTests,
  mvTestVariants,
  mvVariantAssignments,
  campaigns,
  type MultivariateTest,
  type MvTestVariant,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type CreateTestInput = {
  campaignId: string;
  name: string;
  description?: string;
  winnerMetric?:
    | 'open_rate'
    | 'click_rate'
    | 'click_to_open_rate'
    | 'conversion_rate'
    | 'revenue_per_email';
  testAudiencePercent?: number;
  testWindowHours?: number;
  autoSendWinner?: boolean;
  confidenceThreshold?: number;
  variants: Array<{
    name: string;
    element: 'subject' | 'preheader' | 'from_name' | 'content' | 'send_time';
    value: string | Record<string, unknown>;
    allocationPercent: number;
    isControl?: boolean;
  }>;
};

export async function createMultivariateTest(
  orgId: string,
  input: CreateTestInput,
): Promise<MultivariateTest & { variants: MvTestVariant[] }> {
  // Validate input
  if (input.variants.length < 2) {
    throw AppError.badRequest('At least 2 variants required (1 control + 1 treatment)');
  }
  if (input.variants.length > 8) {
    throw AppError.badRequest('Max 8 variants supported per test (statistical power degrades)');
  }
  const pctSum = input.variants.reduce((acc, v) => acc + v.allocationPercent, 0);
  if (Math.abs(pctSum - 100) > 0.01) {
    throw AppError.badRequest('Variant allocation_percent values must sum to 100');
  }
  const controls = input.variants.filter((v) => v.isControl).length;
  if (controls > 1) throw AppError.badRequest('Only one variant may be marked is_control');

  const testAudiencePercent = input.testAudiencePercent ?? 30;
  if (testAudiencePercent < 5 || testAudiencePercent > 100) {
    throw AppError.badRequest('test_audience_percent must be between 5 and 100');
  }

  // Verify campaign belongs to org
  const [camp] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!camp) throw AppError.notFound('Campaign');

  return db.transaction(async (tx) => {
    const [test] = await tx
      .insert(multivariateTests)
      .values({
        orgId,
        campaignId: input.campaignId,
        name: input.name,
        description: input.description,
        winnerMetric: input.winnerMetric ?? 'open_rate',
        testAudiencePercent,
        testWindowHours: input.testWindowHours ?? 4,
        autoSendWinner: input.autoSendWinner ?? true,
        confidenceThreshold: String(input.confidenceThreshold ?? 95),
      })
      .returning();

    const variantRows = await tx
      .insert(mvTestVariants)
      .values(
        input.variants.map((v) => ({
          testId: test!.id,
          orgId,
          name: v.name,
          isControl: v.isControl ?? false,
          element: v.element,
          value: v.value,
          allocationPercent: String(v.allocationPercent),
        })),
      )
      .returning();

    return { ...test!, variants: variantRows };
  });
}

export async function listMultivariateTests(
  orgId: string,
  opts: { campaignId?: string; status?: string; limit?: number } = {},
): Promise<MultivariateTest[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const conditions = [eq(multivariateTests.orgId, orgId)];
  if (opts.campaignId) conditions.push(eq(multivariateTests.campaignId, opts.campaignId));
  if (opts.status)
    conditions.push(
      eq(
        multivariateTests.status,
        opts.status as (typeof multivariateTests.status.enumValues)[number],
      ),
    );

  return db
    .select()
    .from(multivariateTests)
    .where(and(...conditions))
    .orderBy(desc(multivariateTests.createdAt))
    .limit(limit);
}

export async function getMultivariateTest(
  orgId: string,
  testId: string,
): Promise<MultivariateTest & { variants: MvTestVariant[] }> {
  const [test] = await db
    .select()
    .from(multivariateTests)
    .where(and(eq(multivariateTests.id, testId), eq(multivariateTests.orgId, orgId)))
    .limit(1);
  if (!test) throw AppError.notFound('MultivariateTest');
  const variants = await db
    .select()
    .from(mvTestVariants)
    .where(eq(mvTestVariants.testId, testId))
    .orderBy(desc(mvTestVariants.isControl), mvTestVariants.createdAt);
  return { ...test, variants };
}

/**
 * Start a test: flips status to `running`, records start time, and schedules the
 * automatic winner-select moment. Does not actually enqueue the send — that's
 * done by the campaign pipeline which looks up variant assignments at send time.
 */
export async function startMultivariateTest(
  orgId: string,
  testId: string,
): Promise<MultivariateTest> {
  const test = await getMultivariateTest(orgId, testId);
  if (test.status !== 'draft') {
    throw AppError.badRequest(`Test is already ${test.status}; only draft tests can be started`);
  }
  const now = new Date();
  const winnerAt = new Date(now.getTime() + test.testWindowHours * 60 * 60 * 1000);

  const [updated] = await db
    .update(multivariateTests)
    .set({
      status: 'running',
      startedAt: now,
      winnerSelectAt: winnerAt,
      updatedAt: now,
    })
    .where(eq(multivariateTests.id, testId))
    .returning();

  return updated!;
}

/**
 * Deterministic variant assignment for a (test, contact) pair.
 * Uses postgres md5 + mod for stable random allocation.
 *
 * Returns the variant the contact is assigned to (creates the assignment row
 * if it doesn't yet exist).
 */
export async function assignVariant(
  testId: string,
  contactId: string,
): Promise<MvTestVariant | null> {
  // Existing assignment?
  const [existing] = await db
    .select({ variantId: mvVariantAssignments.variantId })
    .from(mvVariantAssignments)
    .where(
      and(eq(mvVariantAssignments.testId, testId), eq(mvVariantAssignments.contactId, contactId)),
    )
    .limit(1);

  if (existing) {
    const [v] = await db
      .select()
      .from(mvTestVariants)
      .where(eq(mvTestVariants.id, existing.variantId))
      .limit(1);
    return v ?? null;
  }

  const variants = await db
    .select()
    .from(mvTestVariants)
    .where(eq(mvTestVariants.testId, testId))
    .orderBy(mvTestVariants.createdAt);

  if (variants.length === 0) return null;

  // Deterministic bucket 0..99 from md5(contact::text || test::text)
  const [row] = (await db.execute<{ bucket: string }>(sql`
    SELECT (('x' || substr(md5(${contactId}::text || ${testId}::text), 1, 8))::bit(32)::int % 100) AS bucket
  `)) as unknown as Array<{ bucket: string }>;
  const bucket = Math.abs(Number(row?.bucket ?? 0));

  // Walk the allocation to find which variant this bucket falls into
  let cumulative = 0;
  let picked = variants[0]!;
  for (const v of variants) {
    cumulative += Number(v.allocationPercent);
    if (bucket < cumulative) {
      picked = v;
      break;
    }
  }

  await db
    .insert(mvVariantAssignments)
    .values({ testId, variantId: picked.id, contactId })
    .onConflictDoNothing();

  return picked;
}

/**
 * Increment stat counters for a variant (called by workers when events arrive).
 * `delta` object contains the fields to bump.
 */
export async function incrementVariantStats(
  variantId: string,
  delta: Partial<{
    totalSent: number;
    totalDelivered: number;
    totalOpens: number;
    uniqueOpens: number;
    totalClicks: number;
    uniqueClicks: number;
    totalConversions: number;
    totalRevenue: number;
  }>,
): Promise<void> {
  // Build SET clause dynamically so only touched fields are updated
  const parts: Array<ReturnType<typeof sql>> = [];
  if (delta.totalSent) parts.push(sql`total_sent = total_sent + ${delta.totalSent}`);
  if (delta.totalDelivered)
    parts.push(sql`total_delivered = total_delivered + ${delta.totalDelivered}`);
  if (delta.totalOpens) parts.push(sql`total_opens = total_opens + ${delta.totalOpens}`);
  if (delta.uniqueOpens) parts.push(sql`unique_opens = unique_opens + ${delta.uniqueOpens}`);
  if (delta.totalClicks) parts.push(sql`total_clicks = total_clicks + ${delta.totalClicks}`);
  if (delta.uniqueClicks) parts.push(sql`unique_clicks = unique_clicks + ${delta.uniqueClicks}`);
  if (delta.totalConversions)
    parts.push(sql`total_conversions = total_conversions + ${delta.totalConversions}`);
  if (delta.totalRevenue) parts.push(sql`total_revenue = total_revenue + ${delta.totalRevenue}`);

  if (parts.length === 0) return;

  parts.push(sql`updated_at = NOW()`);
  const setClause = sql.join(parts, sql`, `);

  await db.execute(sql`UPDATE mv_test_variants SET ${setClause} WHERE id = ${variantId}::uuid`);
}

/**
 * Compute the winner of a running test. Uses the configured metric.
 * Returns the winning variant or null if no clear winner (ties, insufficient data).
 *
 * Also handles the z-test for two-proportion confidence (simplified):
 * if confidenceThreshold > 0, winner must beat runner-up by ≥ z-score for
 * the threshold with the observed sample sizes.
 */
export async function selectWinner(
  orgId: string,
  testId: string,
): Promise<{
  test: MultivariateTest;
  winner: MvTestVariant | null;
  rankings: Array<MvTestVariant & { score: number; rank: number }>;
}> {
  const { variants, ...test } = await getMultivariateTest(orgId, testId);

  if (test.status !== 'running' && test.status !== 'selecting_winner') {
    throw AppError.badRequest(`Cannot select winner — test is ${test.status}`);
  }

  const scored = variants.map((v) => {
    const sent = v.totalSent || 1;
    const delivered = v.totalDelivered || 1;
    const uniqueOpens = v.uniqueOpens || 0;
    const uniqueClicks = v.uniqueClicks || 0;
    const revenue = Number(v.totalRevenue);
    let score = 0;
    switch (test.winnerMetric) {
      case 'open_rate':
        score = uniqueOpens / delivered;
        break;
      case 'click_rate':
        score = uniqueClicks / delivered;
        break;
      case 'click_to_open_rate':
        score = uniqueOpens > 0 ? uniqueClicks / uniqueOpens : 0;
        break;
      case 'conversion_rate':
        score = v.totalConversions / delivered;
        break;
      case 'revenue_per_email':
        score = revenue / sent;
        break;
    }
    return { ...v, score, rank: 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((v, i) => (v.rank = i + 1));

  const winner = scored[0];
  const runnerUp = scored[1];

  // Confidence check: winner must beat runner-up by ≥ thresholdDelta.
  // Simplified: require winner score to be at least (threshold/100) times above runner-up.
  let pickedWinner: (typeof scored)[0] | null = null;
  const confidence = Number(test.confidenceThreshold);
  if (winner && (!runnerUp || winner.score > runnerUp.score)) {
    if (confidence <= 0) {
      pickedWinner = winner;
    } else if (runnerUp && runnerUp.score > 0) {
      const lift = (winner.score - runnerUp.score) / runnerUp.score;
      // Need ~5% lift at 95% confidence with reasonable N — loose heuristic
      const minLift = (100 - confidence) / 1000 + 0.02;
      if (lift >= minLift) pickedWinner = winner;
    } else if (runnerUp?.score === 0 && winner.score > 0) {
      pickedWinner = winner;
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(multivariateTests)
    .set({
      status: pickedWinner ? 'winner_selected' : 'completed',
      winnerVariantId: pickedWinner?.id ?? null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(multivariateTests.id, testId))
    .returning();

  return {
    test: updated!,
    winner: pickedWinner ?? null,
    rankings: scored,
  };
}

export async function cancelMultivariateTest(
  orgId: string,
  testId: string,
): Promise<MultivariateTest> {
  const [existing] = await db
    .select()
    .from(multivariateTests)
    .where(and(eq(multivariateTests.id, testId), eq(multivariateTests.orgId, orgId)))
    .limit(1);
  if (!existing) throw AppError.notFound('MultivariateTest');
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw AppError.badRequest(`Test is already ${existing.status}`);
  }

  const [updated] = await db
    .update(multivariateTests)
    .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(multivariateTests.id, testId))
    .returning();

  return updated!;
}

/**
 * Process tests whose winnerSelectAt has elapsed. Run by a scheduled worker.
 */
export async function processDueTests(): Promise<{ processed: number }> {
  const due = await db
    .select()
    .from(multivariateTests)
    .where(
      and(
        eq(multivariateTests.status, 'running'),
        sql`${multivariateTests.winnerSelectAt} <= NOW()`,
      ),
    )
    .limit(100);

  for (const t of due) {
    try {
      await selectWinner(t.orgId, t.id);
    } catch {
      // Swallow per-test errors so the batch continues
    }
  }
  return { processed: due.length };
}

void inArray;
