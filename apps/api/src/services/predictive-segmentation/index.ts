/**
 * Predictive segmentation — customer lifetime value (CLV), purchase likelihood
 * and churn risk. Uses simple, well-behaved heuristics that work on any
 * engagement/commerce data we already track — no external ML service.
 *
 * The scores are written back to `contact_engagement` so segments can use
 * them directly through the existing segment rule engine.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactEngagement, contacts } from '../../db/schema/index.js';

export interface PredictiveScores {
  clv: number; // predicted USD lifetime value
  purchaseLikelihood: number; // 0..1
  churnRisk: number; // 0..1
}

/** Compute scores for a single contact from its engagement aggregates. */
export function computeScores(row: {
  totalOrders: number;
  totalRevenue: number;
  totalOpens: number;
  totalClicks: number;
  totalSends: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}): PredictiveScores {
  const now = Date.now();
  const tenureDays = row.firstOrderAt
    ? Math.max(1, (now - row.firstOrderAt.getTime()) / 86_400_000)
    : 0;
  const daysSinceLastOrder = row.lastOrderAt
    ? (now - row.lastOrderAt.getTime()) / 86_400_000
    : Infinity;

  // CLV — extrapolate current purchase velocity across a 2-year horizon.
  const avgOrder = row.totalOrders > 0 ? row.totalRevenue / row.totalOrders : 0;
  const ordersPerDay = tenureDays > 0 ? row.totalOrders / tenureDays : 0;
  const clv = Math.round(avgOrder * ordersPerDay * 730 * 100) / 100;

  // Purchase likelihood — combines recency, frequency and recent engagement.
  const recencyScore = row.totalOrders === 0 ? 0 : Math.exp(-daysSinceLastOrder / 30); // half-life ~21d
  const engagementScore =
    row.totalSends > 0
      ? Math.min(1, (row.totalOpens * 0.4 + row.totalClicks * 1.0) / row.totalSends)
      : 0;
  const frequencyScore = Math.min(1, row.totalOrders / 5);
  const purchaseLikelihood = Math.min(
    1,
    0.5 * recencyScore + 0.3 * engagementScore + 0.2 * frequencyScore,
  );

  // Churn risk — high if recent inactivity + previously active.
  const wasActive = row.totalOrders >= 1 || row.totalOpens >= 3;
  const churnRisk = !wasActive ? 0.1 : Math.min(1, daysSinceLastOrder / 180);

  return {
    clv: Number.isFinite(clv) ? clv : 0,
    purchaseLikelihood: Math.round(purchaseLikelihood * 1000) / 1000,
    churnRisk: Math.round(churnRisk * 1000) / 1000,
  };
}

/** Recompute scores for every contact in the org. */
export async function refreshOrgPredictions(orgId: string): Promise<{ updated: number }> {
  const rows = await db.select().from(contactEngagement).where(eq(contactEngagement.orgId, orgId));

  let updated = 0;
  for (const row of rows) {
    const scores = computeScores({
      totalOrders: row.totalOrders,
      totalRevenue: Number(row.totalRevenue),
      totalOpens: row.totalOpens,
      totalClicks: row.totalClicks,
      totalSends: row.totalSends,
      firstOrderAt: row.firstOrderAt,
      lastOrderAt: row.lastOrderAt,
    });
    await db
      .update(contactEngagement)
      .set({
        predictedClv: scores.clv.toFixed(2),
        purchaseLikelihood: scores.purchaseLikelihood.toFixed(3),
        churnRisk: scores.churnRisk.toFixed(3),
        predictedAt: new Date(),
      })
      .where(eq(contactEngagement.contactId, row.contactId));
    updated++;
  }
  return { updated };
}

/** Get scored contacts above/below a threshold — used for "top 10% buyers", etc. */
export async function topContactsByScore(
  orgId: string,
  metric: 'clv' | 'purchase_likelihood' | 'churn_risk',
  limit = 50,
): Promise<Array<{ contactId: string; email: string | null; score: number }>> {
  const column =
    metric === 'clv'
      ? 'predicted_clv'
      : metric === 'purchase_likelihood'
        ? 'purchase_likelihood'
        : 'churn_risk';

  const rows = await db.execute<{ contact_id: string; email: string | null; score: string }>(sql`
    SELECT ce.contact_id, c.email, ce.${sql.raw(column)}::text AS score
    FROM contact_engagement ce
    JOIN contacts c ON c.id = ce.contact_id
    WHERE ce.org_id = ${orgId}::uuid
      AND ce.${sql.raw(column)} IS NOT NULL
    ORDER BY ce.${sql.raw(column)} DESC NULLS LAST
    LIMIT ${limit}
  `);

  return (
    rows as unknown as Array<{ contact_id: string; email: string | null; score: string }>
  ).map((r) => ({
    contactId: r.contact_id,
    email: r.email,
    score: Number(r.score),
  }));
}

/** Org-level summary — avg CLV, high-likelihood count, at-risk count. */
export async function orgPredictiveSummary(orgId: string): Promise<{
  totalContacts: number;
  avgClv: number;
  highLikelihoodCount: number;
  atRiskCount: number;
}> {
  const [row] = (await db.execute<{
    total: string;
    avg_clv: string | null;
    hi: string;
    risk: string;
  }>(sql`
    SELECT
      COUNT(*)::text AS total,
      AVG(predicted_clv)::text AS avg_clv,
      COUNT(*) FILTER (WHERE purchase_likelihood >= 0.6)::text AS hi,
      COUNT(*) FILTER (WHERE churn_risk >= 0.7)::text AS risk
    FROM contact_engagement
    WHERE org_id = ${orgId}::uuid
  `)) as unknown as Array<{ total: string; avg_clv: string | null; hi: string; risk: string }>;

  return {
    totalContacts: Number(row?.total ?? 0),
    avgClv: row?.avg_clv ? Number(row.avg_clv) : 0,
    highLikelihoodCount: Number(row?.hi ?? 0),
    atRiskCount: Number(row?.risk ?? 0),
  };
}

/**
 * Single-contact lookup. Returns null when the engagement row exists but
 * predictions haven't been computed yet (predictedAt is null) so the UI
 * can show "scores pending — run refresh" instead of zeros.
 */
export async function getContactPredictions(
  orgId: string,
  contactId: string,
): Promise<{
  clv: number;
  purchaseLikelihood: number;
  churnRisk: number;
  predictedAt: Date | null;
} | null> {
  const [row] = await db
    .select({
      clv: contactEngagement.predictedClv,
      pl: contactEngagement.purchaseLikelihood,
      ch: contactEngagement.churnRisk,
      at: contactEngagement.predictedAt,
      orgId: contactEngagement.orgId,
    })
    .from(contactEngagement)
    .where(eq(contactEngagement.contactId, contactId))
    .limit(1);

  if (!row || row.orgId !== orgId) return null;
  if (!row.at) return null;
  return {
    clv: Number(row.clv ?? 0),
    purchaseLikelihood: Number(row.pl ?? 0),
    churnRisk: Number(row.ch ?? 0),
    predictedAt: row.at,
  };
}

/**
 * CLV-band distribution for charts. Buckets:
 *   0 (no orders), 1–50, 50–250, 250–1000, 1000+
 * plus churn-risk buckets (low <0.3, medium 0.3–0.7, high >=0.7).
 * Buckets are fixed so the UI stays stable across orgs of different sizes.
 */
export async function predictiveDistribution(orgId: string): Promise<{
  clv: Array<{ bucket: string; count: number }>;
  churn: Array<{ bucket: string; count: number }>;
}> {
  const clvRows = (await db.execute<{ bucket: string; count: string }>(sql`
    SELECT
      CASE
        WHEN predicted_clv IS NULL OR predicted_clv <= 0 THEN '0'
        WHEN predicted_clv < 50 THEN '1-50'
        WHEN predicted_clv < 250 THEN '50-250'
        WHEN predicted_clv < 1000 THEN '250-1000'
        ELSE '1000+'
      END AS bucket,
      COUNT(*)::text AS count
    FROM contact_engagement
    WHERE org_id = ${orgId}::uuid
    GROUP BY 1
  `)) as unknown as Array<{ bucket: string; count: string }>;

  const churnRows = (await db.execute<{ bucket: string; count: string }>(sql`
    SELECT
      CASE
        WHEN churn_risk IS NULL THEN 'unknown'
        WHEN churn_risk < 0.3 THEN 'low'
        WHEN churn_risk < 0.7 THEN 'medium'
        ELSE 'high'
      END AS bucket,
      COUNT(*)::text AS count
    FROM contact_engagement
    WHERE org_id = ${orgId}::uuid
    GROUP BY 1
  `)) as unknown as Array<{ bucket: string; count: string }>;

  return {
    clv: clvRows.map((r) => ({ bucket: r.bucket, count: Number(r.count) })),
    churn: churnRows.map((r) => ({ bucket: r.bucket, count: Number(r.count) })),
  };
}

/**
 * Refresh predictive scores for every org that has any engagement rows.
 * Sequential per-org to keep pool pressure predictable; same shape as
 * refreshAllOrgsRfm so the daily-run orchestrator can call both.
 */
export async function refreshAllOrgsPredictions(): Promise<{
  orgs: number;
  updated: number;
  errors: number;
}> {
  const rows = (await db.execute<{ org_id: string }>(sql`
    SELECT DISTINCT org_id FROM contact_engagement
  `)) as unknown as Array<{ org_id: string }>;

  let updated = 0;
  let errors = 0;
  for (const { org_id } of rows) {
    try {
      const r = await refreshOrgPredictions(org_id);
      updated += r.updated;
    } catch {
      errors++;
    }
  }
  return { orgs: rows.length, updated, errors };
}

/** Ensure every org contact has an engagement row (lazy bootstrap). */
export async function ensureEngagementRows(orgId: string): Promise<number> {
  const res = await db.execute(sql`
    INSERT INTO contact_engagement (contact_id, org_id)
    SELECT id, org_id FROM contacts WHERE org_id = ${orgId}::uuid
    ON CONFLICT (contact_id) DO NOTHING
  `);
  void contacts;
  return (res as unknown as { rowCount?: number }).rowCount ?? 0;
}
