/**
 * Unsubscribe page A/B testing.
 * Tests different "save the subscriber" flows to reduce unsubscribes.
 * Flows: immediate_unsub (control) | offer_pause | offer_downgrade | offer_preferences | offer_reason
 */
import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  unsubscribeExperiments,
  unsubscribeVariants,
  type UnsubscribeExperiment,
  type UnsubscribeVariant,
} from '../../db/schema/unsubscribe-experiments.js';

export interface AssignedVariant {
  variantId: string;
  flow: string;
  headline: string | null;
  bodyText: string | null;
  ctaLabel: string | null;
  pauseDays: number | null;
}

/**
 * Assign a variant to a contact deterministically (hash-based, no DB write per request).
 * Always returns the control if no active experiment exists.
 */
export async function assignVariant(
  orgId: string,
  contactId: string,
): Promise<AssignedVariant | null> {
  // Find active experiment
  const [exp] = await db
    .select()
    .from(unsubscribeExperiments)
    .where(
      and(eq(unsubscribeExperiments.orgId, orgId), eq(unsubscribeExperiments.status, 'active')),
    )
    .orderBy(desc(unsubscribeExperiments.createdAt))
    .limit(1);

  if (!exp) return null;

  const variants = await db
    .select()
    .from(unsubscribeVariants)
    .where(eq(unsubscribeVariants.experimentId, exp.id));

  if (!variants.length) return null;

  // Hash contactId to a 0-1 bucket
  let hash = 0;
  for (let i = 0; i < contactId.length; i++) {
    hash = (hash * 31 + contactId.charCodeAt(i)) & 0xffffffff;
  }
  const bucket = Math.abs(hash) / 0xffffffff;

  // Assign by cumulative weight
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.trafficWeight;
    if (bucket <= cumulative) {
      return {
        variantId: v.id,
        flow: v.flow,
        headline: v.headline,
        bodyText: v.bodyText,
        ctaLabel: v.ctaLabel,
        pauseDays: v.pauseDays,
      };
    }
  }
  const fallback = variants[0]!;
  return {
    variantId: fallback.id,
    flow: fallback.flow,
    headline: fallback.headline,
    bodyText: fallback.bodyText,
    ctaLabel: fallback.ctaLabel,
    pauseDays: fallback.pauseDays,
  };
}

/** Record that a contact was shown a variant (impression). */
/**
 * Count that one organization's variant was shown.
 *
 * The orgId is not decoration. `POST
 * /api/v1/unsubscribe-experiments/variants/:variantId/impression` takes the id
 * from the path and every authenticated tenant can reach it, so without the org
 * filter one account could inflate another's experiment counters — and those
 * counters are what the analysis endpoint reads to declare a winning variant.
 * Both callers hold the org already: the API route has `req.user.orgId`, and the
 * public preference centre resolves it from the signed `pref` token before it
 * ever picks a variant.
 */
export async function recordImpression(orgId: string, variantId: string): Promise<void> {
  await db
    .update(unsubscribeVariants)
    .set({ impressions: sql`impressions + 1` })
    .where(and(eq(unsubscribeVariants.id, variantId), eq(unsubscribeVariants.orgId, orgId)));
}

/** Record the final outcome: saved (kept subscribed) or unsubscribed. */
/**
 * Count how that impression ended, for one organization's variant.
 *
 * Same reasoning as recordImpression: the id arrives in the path of a route any
 * tenant can call, and saved_count against unsub_count is the whole result of
 * the experiment. A neighbour able to move either number can pick the winner.
 */
export async function recordOutcome(
  orgId: string,
  variantId: string,
  saved: boolean,
): Promise<void> {
  const mine = and(eq(unsubscribeVariants.id, variantId), eq(unsubscribeVariants.orgId, orgId));
  if (saved) {
    await db
      .update(unsubscribeVariants)
      .set({ savedCount: sql`saved_count + 1` })
      .where(mine);
  } else {
    await db
      .update(unsubscribeVariants)
      .set({ unsubCount: sql`unsub_count + 1` })
      .where(mine);
  }
}

/** Calculate save rate per variant and pick a winner (95%+ significance via Wilson score). */
export async function analyzeExperiment(
  orgId: string,
  experimentId: string,
): Promise<Array<{ variant: UnsubscribeVariant; saveRate: number; significant: boolean }>> {
  const variants = await db
    .select()
    .from(unsubscribeVariants)
    .where(
      and(eq(unsubscribeVariants.experimentId, experimentId), eq(unsubscribeVariants.orgId, orgId)),
    );

  return variants
    .map((v) => {
      const n = v.impressions;
      const saves = v.savedCount;
      const saveRate = n > 0 ? saves / n : 0;
      // Wilson score lower bound (95% confidence interval)
      const significant =
        n >= 50 && saveRate - 1.96 * Math.sqrt((saveRate * (1 - saveRate)) / n) > 0;
      return { variant: v, saveRate, significant };
    })
    .sort((a, b) => b.saveRate - a.saveRate);
}

/** Declare a winner and mark experiment completed. */
export async function declareWinner(
  orgId: string,
  experimentId: string,
  winnerVariantId: string,
): Promise<UnsubscribeExperiment> {
  const [row] = await db
    .update(unsubscribeExperiments)
    .set({ status: 'completed', winnerVariantId, updatedAt: new Date() })
    .where(
      and(eq(unsubscribeExperiments.id, experimentId), eq(unsubscribeExperiments.orgId, orgId)),
    )
    .returning();
  return row!;
}
