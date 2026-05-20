/**
 * Predictive Lead Scoring.
 *
 * Extends the rule-based lead score with a conversion-probability model
 * derived from already-computed predictive features on contact_engagement:
 *   - purchaseLikelihood (0..1)
 *   - churnRisk          (0..1)
 *   - predictedClv       (value tier)
 *   - rfmScore           (1..555)
 *
 * Combined with the rule-based leadScore, produces:
 *   predictedConversionProbability  ∈ [0, 1]
 *   grade                            ∈ A..D
 *
 * This is a transparent linear model — easy to explain, easy to tune.
 * A real XGBoost/LightGBM model can be slotted in by replacing scoreContact().
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactEngagement, contacts } from '../../db/schema/index.js';

export interface PredictiveScore {
  contactId: string;
  leadScore: number; // existing rule-based score
  predictedConversionProbability: number; // 0..1
  grade: 'A' | 'B' | 'C' | 'D';
  factors: {
    purchaseLikelihood: number;
    churnRisk: number;
    predictedClv: number;
    rfmScore: number;
    leadScoreComponent: number;
  };
}

function gradeOf(p: number): PredictiveScore['grade'] {
  if (p >= 0.7) return 'A';
  if (p >= 0.45) return 'B';
  if (p >= 0.2) return 'C';
  return 'D';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Linear combination with sigmoid-like output.
 *
 * Weights (tuned by hand on first release — replace with fitted model later):
 *   purchaseLikelihood  0.45   (strongest signal — already a probability)
 *   rule-based score    0.25   (weight of behavioural tracking)
 *   rfmScore normalized 0.15
 *   clv tier            0.10
 *   churnRisk           -0.25  (subtracted)
 */
export function scoreContact(inputs: {
  leadScore: number;
  purchaseLikelihood: number | null;
  churnRisk: number | null;
  predictedClv: number | null;
  rfmScore: number | null;
}): { probability: number; factors: PredictiveScore['factors'] } {
  const purchaseLikelihood = clamp(inputs.purchaseLikelihood ?? 0, 0, 1);
  const churnRisk = clamp(inputs.churnRisk ?? 0, 0, 1);
  const rfmScore = clamp((inputs.rfmScore ?? 0) / 555, 0, 1);
  const clvTier = clamp((inputs.predictedClv ?? 0) / 1000, 0, 1); // >$1000 → 1.0
  // Normalize rule-based score: assume 200 (SQL threshold) ≈ strong lead
  const leadScoreComponent = clamp(inputs.leadScore / 200, 0, 1);

  const raw =
    0.45 * purchaseLikelihood +
    0.25 * leadScoreComponent +
    0.15 * rfmScore +
    0.1 * clvTier -
    0.25 * churnRisk;

  // Squash into [0, 1]; clamp rather than sigmoid for explainability.
  const probability = clamp(raw, 0, 1);

  return {
    probability,
    factors: {
      purchaseLikelihood,
      churnRisk,
      predictedClv: clvTier,
      rfmScore,
      leadScoreComponent,
    },
  };
}

export async function predictConversion(
  orgId: string,
  contactId: string,
): Promise<PredictiveScore | null> {
  const [contact] = await db
    .select({ leadScore: contacts.leadScore })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)));
  if (!contact) return null;

  const [eng] = await db
    .select()
    .from(contactEngagement)
    .where(and(eq(contactEngagement.contactId, contactId), eq(contactEngagement.orgId, orgId)));

  const leadScore = contact.leadScore ?? 0;
  const { probability, factors } = scoreContact({
    leadScore,
    purchaseLikelihood: eng?.purchaseLikelihood ? Number(eng.purchaseLikelihood) : null,
    churnRisk: eng?.churnRisk ? Number(eng.churnRisk) : null,
    predictedClv: eng?.predictedClv ? Number(eng.predictedClv) : null,
    rfmScore: eng?.rfmScore ?? null,
  });

  return {
    contactId,
    leadScore,
    predictedConversionProbability: Math.round(probability * 10000) / 10000,
    grade: gradeOf(probability),
    factors,
  };
}

/**
 * Bulk variant — scores up to `limit` contacts sorted by leadScore desc.
 */
export async function topPredictedContacts(orgId: string, limit = 100): Promise<PredictiveScore[]> {
  const rows = await db
    .select({
      id: contacts.id,
      leadScore: contacts.leadScore,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(limit);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const engs = await db
    .select()
    .from(contactEngagement)
    .where(and(eq(contactEngagement.orgId, orgId), inArray(contactEngagement.contactId, ids)));
  const engByContact = new Map(engs.map((e) => [e.contactId, e]));

  const results = rows.map((r) => {
    const eng = engByContact.get(r.id);
    const leadScore = r.leadScore ?? 0;
    const { probability, factors } = scoreContact({
      leadScore,
      purchaseLikelihood: eng?.purchaseLikelihood ? Number(eng.purchaseLikelihood) : null,
      churnRisk: eng?.churnRisk ? Number(eng.churnRisk) : null,
      predictedClv: eng?.predictedClv ? Number(eng.predictedClv) : null,
      rfmScore: eng?.rfmScore ?? null,
    });
    return {
      contactId: r.id,
      leadScore,
      predictedConversionProbability: Math.round(probability * 10000) / 10000,
      grade: gradeOf(probability),
      factors,
    } satisfies PredictiveScore;
  });

  return results.sort(
    (a, b) => b.predictedConversionProbability - a.predictedConversionProbability,
  );
}
