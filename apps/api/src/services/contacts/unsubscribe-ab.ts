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
  const [exp] = await db.select().from(unsubscribeExperiments)
    .where(and(
      eq(unsubscribeExperiments.orgId, orgId),
      eq(unsubscribeExperiments.status, 'active'),
    ))
    .orderBy(desc(unsubscribeExperiments.createdAt))
    .limit(1);

  if (!exp) return null;

  const variants = await db.select().from(unsubscribeVariants)
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
export async function recordImpression(variantId: string): Promise<void> {
  await db.update(unsubscribeVariants)
    .set({ impressions: sql`impressions + 1` })
    .where(eq(unsubscribeVariants.id, variantId));
}

/** Record the final outcome: saved (kept subscribed) or unsubscribed. */
export async function recordOutcome(variantId: string, saved: boolean): Promise<void> {
  if (saved) {
    await db.update(unsubscribeVariants)
      .set({ savedCount: sql`saved_count + 1` })
      .where(eq(unsubscribeVariants.id, variantId));
  } else {
    await db.update(unsubscribeVariants)
      .set({ unsubCount: sql`unsub_count + 1` })
      .where(eq(unsubscribeVariants.id, variantId));
  }
}

/** Calculate save rate per variant and pick a winner (95%+ significance via Wilson score). */
export async function analyzeExperiment(
  orgId: string,
  experimentId: string,
): Promise<Array<{ variant: UnsubscribeVariant; saveRate: number; significant: boolean }>> {
  const variants = await db.select().from(unsubscribeVariants)
    .where(and(
      eq(unsubscribeVariants.experimentId, experimentId),
      eq(unsubscribeVariants.orgId, orgId),
    ));

  return variants.map((v) => {
    const n = v.impressions;
    const saves = v.savedCount;
    const saveRate = n > 0 ? saves / n : 0;
    // Wilson score lower bound (95% confidence interval)
    const significant = n >= 50 && (saveRate - 1.96 * Math.sqrt(saveRate * (1 - saveRate) / n)) > 0;
    return { variant: v, saveRate, significant };
  }).sort((a, b) => b.saveRate - a.saveRate);
}

/** Declare a winner and mark experiment completed. */
export async function declareWinner(
  orgId: string,
  experimentId: string,
  winnerVariantId: string,
): Promise<UnsubscribeExperiment> {
  const [row] = await db.update(unsubscribeExperiments)
    .set({ status: 'completed', winnerVariantId, updatedAt: new Date() })
    .where(and(eq(unsubscribeExperiments.id, experimentId), eq(unsubscribeExperiments.orgId, orgId)))
    .returning();
  return row!;
}
