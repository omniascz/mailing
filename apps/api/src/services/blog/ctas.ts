/**
 * CTA service (#340/#412).
 *
 * CRUD + impression logging + variant selection wrapping
 * `pickCtaVariant` / `computeCtaPerformance` from the shared pure module.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { ctas, ctaVariants, ctaImpressions, type Cta } from '../../db/schema/ctas.js';
import { AppError } from '../../lib/app-error.js';
import { pickCtaVariant, computeCtaPerformance } from './pure.js';
import {
  matchesAllConditions,
  type VisitorContext,
  type SiteCondition,
} from '../site-messages/pure.js';

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function createCta(
  orgId: string,
  input: {
    name: string;
    type?: 'button' | 'banner' | 'popup' | 'inline' | 'exit_intent';
    content?: Record<string, unknown>;
    conditions?: SiteCondition[];
    active?: boolean;
  },
): Promise<Cta> {
  const [row] = await db
    .insert(ctas)
    .values({
      orgId,
      name: input.name,
      type: input.type ?? 'button',
      content: input.content ?? {},
      conditions: input.conditions ?? [],
      active: input.active ?? false,
    })
    .returning();
  return row!;
}

export async function listCtas(orgId: string): Promise<Cta[]> {
  return db
    .select()
    .from(ctas)
    .where(and(eq(ctas.orgId, orgId), isNull(ctas.deletedAt)));
}

export async function getCta(orgId: string, id: string): Promise<Cta> {
  const [row] = await db
    .select()
    .from(ctas)
    .where(and(eq(ctas.orgId, orgId), eq(ctas.id, id), isNull(ctas.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('CTA');
  return row;
}

export async function deleteCta(orgId: string, id: string): Promise<void> {
  await db
    .update(ctas)
    .set({ deletedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(ctas.orgId, orgId), eq(ctas.id, id)));
}

// ─── Variants ──────────────────────────────────────────────────────────────

/**
 * `cta_variants` has no org_id of its own — a variant belongs to a tenant only
 * through its CTA. So the tenant check cannot be a column comparison on the
 * variant table; the parent has to be resolved first, scoped to the caller.
 *
 * That is why both functions take `orgId` and start here rather than trusting
 * the route to have checked. Before this, `addVariant(ctaId, …)` and
 * `listVariants(ctaId)` took an id straight from the URL and queried by it
 * alone: any authenticated user could read another tenant's variants, and — the
 * worse half — write a variant into another tenant's CTA, where it would then
 * be served to that tenant's visitors by `serveCtas`.
 */
async function assertCtaInOrg(orgId: string, ctaId: string): Promise<void> {
  const [row] = await db
    .select({ id: ctas.id })
    .from(ctas)
    .where(and(eq(ctas.id, ctaId), eq(ctas.orgId, orgId), isNull(ctas.deletedAt)))
    .limit(1);
  // 404 rather than 403: a caller who does not own the CTA should not learn
  // that it exists.
  if (!row) throw AppError.notFound('CTA');
}

export async function addVariant(
  orgId: string,
  ctaId: string,
  input: { name: string; weight?: number; content: Record<string, unknown> },
) {
  await assertCtaInOrg(orgId, ctaId);
  const [row] = await db
    .insert(ctaVariants)
    .values({
      ctaId,
      name: input.name,
      weight: input.weight ?? 1,
      content: input.content,
    })
    .returning();
  return row!;
}

export async function listVariants(orgId: string, ctaId: string) {
  await assertCtaInOrg(orgId, ctaId);
  return db.select().from(ctaVariants).where(eq(ctaVariants.ctaId, ctaId));
}

// ─── Serve: public endpoint ───────────────────────────────────────────────

export interface ServeCtaInput {
  orgId: string;
  context: VisitorContext;
  visitorId?: string;
  contactId?: string;
}

export interface ServedCta {
  ctaId: string;
  variantId: string | null;
  content: Record<string, unknown>;
}

/**
 * Pick every eligible CTA for a visitor context and return the selected
 * variant content for rendering. Logs impressions so analytics can compute
 * CTR later.
 */
export async function serveCtas(input: ServeCtaInput): Promise<ServedCta[]> {
  const active = await db
    .select()
    .from(ctas)
    .where(and(eq(ctas.orgId, input.orgId), eq(ctas.active, true), isNull(ctas.deletedAt)));

  const served: ServedCta[] = [];
  for (const cta of active) {
    const conditions = (cta.conditions ?? []) as SiteCondition[];
    if (!matchesAllConditions(conditions, input.context)) continue;

    const variants = await db.select().from(ctaVariants).where(eq(ctaVariants.ctaId, cta.id));
    const chosen = variants.length > 0 ? pickCtaVariant(variants) : null;

    served.push({
      ctaId: cta.id,
      variantId: chosen?.id ?? null,
      content: chosen
        ? (chosen as unknown as { content: Record<string, unknown> }).content
        : (cta.content as Record<string, unknown>),
    });

    await db.insert(ctaImpressions).values({
      orgId: input.orgId,
      ctaId: cta.id,
      variantId: chosen?.id ?? null,
      visitorId: input.visitorId ?? null,
      contactId: input.contactId ?? null,
    });
  }
  return served;
}

export async function recordCtaClick(opts: {
  orgId: string;
  ctaId: string;
  variantId?: string;
  visitorId?: string;
  contactId?: string;
}): Promise<void> {
  await db.insert(ctaImpressions).values({
    orgId: opts.orgId,
    ctaId: opts.ctaId,
    variantId: opts.variantId ?? null,
    visitorId: opts.visitorId ?? null,
    contactId: opts.contactId ?? null,
    clicked: true,
  });
}

export async function recordCtaDismiss(opts: {
  orgId: string;
  ctaId: string;
  variantId?: string;
  visitorId?: string;
}): Promise<void> {
  await db.insert(ctaImpressions).values({
    orgId: opts.orgId,
    ctaId: opts.ctaId,
    variantId: opts.variantId ?? null,
    visitorId: opts.visitorId ?? null,
    dismissed: true,
  });
}

// ─── Analytics ─────────────────────────────────────────────────────────────

export async function getCtaPerformance(orgId: string, ctaId: string) {
  const result = await db.execute<{
    impressions: number;
    clicks: number;
    dismissals: number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE clicked = false AND dismissed = false)::int AS impressions,
      COUNT(*) FILTER (WHERE clicked = true)::int AS clicks,
      COUNT(*) FILTER (WHERE dismissed = true)::int AS dismissals
    FROM cta_impressions
    WHERE org_id = ${orgId}::uuid AND cta_id = ${ctaId}::uuid
  `);
  const row = result[0] ?? { impressions: 0, clicks: 0, dismissals: 0 };
  return computeCtaPerformance({
    impressions: row.impressions,
    clicks: row.clicks,
    dismissals: row.dismissals,
  });
}
