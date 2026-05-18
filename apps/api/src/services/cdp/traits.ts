/**
 * Trait computation (#268) — real-time computed traits per contact.
 *
 * A trait is a rollup derived from raw events/revenue/engagement. We keep a
 * registry of built-in traits (`BUILTIN_TRAITS`) and support org-defined
 * traits via `defineTrait()` (registered at runtime, e.g. from admin UI).
 *
 * The canonical flow:
 *   1. Event ingestion updates `cdp_events` / `revenue_events`.
 *   2. `computeTraits(orgId, contactId)` runs all applicable traits, merges
 *      the result, and upserts `contact_traits.values`.
 *   3. Unified profile cache is invalidated so agents see fresh numbers.
 *
 * For production throughput the trait worker batches recomputes, but the
 * same function runs inline for small orgs or ad-hoc refreshes.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contactTraits,
  revenueEvents,
  emailEvents,
  sitePageViews,
  cdpEvents,
  contacts,
} from '../../db/schema/index.js';
import { invalidateProfile } from './unified-profile.js';

export interface TraitDefinition<T = unknown> {
  /** Stable key stored in contact_traits.values. */
  key: string;
  /** Short human label (for admin UI). */
  label: string;
  /** Compute the trait for one contact. Return `undefined` to omit. */
  compute: (orgId: string, contactId: string) => Promise<T | undefined>;
}

// ─── Built-in traits ─────────────────────────────────────────────────────────

const ltvTrait: TraitDefinition<number> = {
  key: 'ltv',
  label: 'Lifetime value',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({ total: sql<string>`COALESCE(SUM(${revenueEvents.amount}), 0)::text` })
      .from(revenueEvents)
      .where(and(
        eq(revenueEvents.orgId, orgId),
        eq(revenueEvents.contactId, contactId),
      ));
    return Number(row?.total ?? 0);
  },
};

const totalOrdersTrait: TraitDefinition<number> = {
  key: 'total_orders',
  label: 'Total orders',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({ count: sql<string>`COUNT(*)::text` })
      .from(revenueEvents)
      .where(and(
        eq(revenueEvents.orgId, orgId),
        eq(revenueEvents.contactId, contactId),
      ));
    return Number(row?.count ?? 0);
  },
};

const lastPurchaseAtTrait: TraitDefinition<string> = {
  key: 'last_purchase_at',
  label: 'Last purchase',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({ occurredAt: revenueEvents.occurredAt })
      .from(revenueEvents)
      .where(and(
        eq(revenueEvents.orgId, orgId),
        eq(revenueEvents.contactId, contactId),
      ))
      .orderBy(sql`${revenueEvents.occurredAt} DESC`)
      .limit(1);
    return row?.occurredAt ? row.occurredAt.toISOString() : undefined;
  },
};

const avgOrderValueTrait: TraitDefinition<number> = {
  key: 'average_order_value',
  label: 'Average order value',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({ avg: sql<string>`COALESCE(AVG(${revenueEvents.amount}), 0)::text` })
      .from(revenueEvents)
      .where(and(
        eq(revenueEvents.orgId, orgId),
        eq(revenueEvents.contactId, contactId),
      ));
    return Number(row?.avg ?? 0);
  },
};

const emailEngagementRateTrait: TraitDefinition<number> = {
  key: 'email_engagement_rate',
  label: 'Email engagement rate',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({
        opens: sql<string>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'opened')::text`,
        sends: sql<string>`COUNT(*) FILTER (WHERE ${emailEvents.eventType} = 'sent')::text`,
      })
      .from(emailEvents)
      .where(and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.contactId, contactId),
      ));
    const opens = Number(row?.opens ?? 0);
    const sends = Number(row?.sends ?? 0);
    if (sends === 0) return 0;
    return Math.round((opens / sends) * 10000) / 10000;
  },
};

const lastPageViewAtTrait: TraitDefinition<string> = {
  key: 'last_page_view_at',
  label: 'Last page view',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({ occurredAt: sitePageViews.occurredAt })
      .from(sitePageViews)
      .where(and(
        eq(sitePageViews.orgId, orgId),
        eq(sitePageViews.contactId, contactId),
      ))
      .orderBy(sql`${sitePageViews.occurredAt} DESC`)
      .limit(1);
    return row?.occurredAt ? row.occurredAt.toISOString() : undefined;
  },
};

const daysSinceLastPurchaseTrait: TraitDefinition<number> = {
  key: 'days_since_last_purchase',
  label: 'Days since last purchase',
  async compute(orgId, contactId) {
    const [row] = await db
      .select({
        days: sql<string>`EXTRACT(DAY FROM (now() - MAX(${revenueEvents.occurredAt})))::text`,
      })
      .from(revenueEvents)
      .where(and(
        eq(revenueEvents.orgId, orgId),
        eq(revenueEvents.contactId, contactId),
      ));
    const val = row?.days;
    return val != null ? Math.floor(Number(val)) : undefined;
  },
};

const BUILTIN_TRAITS: TraitDefinition[] = [
  ltvTrait,
  totalOrdersTrait,
  lastPurchaseAtTrait,
  avgOrderValueTrait,
  emailEngagementRateTrait,
  lastPageViewAtTrait,
  daysSinceLastPurchaseTrait,
];

// ─── Org-registered traits ───────────────────────────────────────────────────

const orgTraits = new Map<string, TraitDefinition[]>();

export function defineTrait(orgId: string, def: TraitDefinition): void {
  const existing = orgTraits.get(orgId) ?? [];
  const filtered = existing.filter((t) => t.key !== def.key);
  filtered.push(def);
  orgTraits.set(orgId, filtered);
}

export function listTraitDefinitions(orgId: string): TraitDefinition[] {
  return [...BUILTIN_TRAITS, ...(orgTraits.get(orgId) ?? [])];
}

// ─── Compute & persist ───────────────────────────────────────────────────────

export async function computeTraits(
  orgId: string,
  contactId: string,
): Promise<Record<string, unknown>> {
  const defs = listTraitDefinitions(orgId);
  const values: Record<string, unknown> = {};

  // Compute all traits concurrently — most are light SELECTs.
  const results = await Promise.all(
    defs.map(async (def) => {
      try {
        return [def.key, await def.compute(orgId, contactId)] as const;
      } catch {
        return [def.key, undefined] as const;
      }
    }),
  );
  for (const [key, value] of results) {
    if (value !== undefined) values[key] = value;
  }

  const version = String(Date.now());
  await db
    .insert(contactTraits)
    .values({ contactId, orgId, values, version })
    .onConflictDoUpdate({
      target: contactTraits.contactId,
      set: { values, version, computedAt: new Date() },
    });

  await invalidateProfile(orgId, contactId);
  return values;
}

export async function getTraits(
  orgId: string,
  contactId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ values: contactTraits.values })
    .from(contactTraits)
    .where(and(eq(contactTraits.orgId, orgId), eq(contactTraits.contactId, contactId)))
    .limit(1);
  return row?.values ?? {};
}

/**
 * Walk all contacts (or a filtered slice) and recompute. Production code
 * calls this from a nightly BullMQ worker; supports `since` so incremental
 * runs only touch contacts that had fresh events.
 */
export async function recomputeAllTraits(
  orgId: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<{ processed: number }> {
  const limit = opts.limit ?? 5000;
  const whereClauses = [eq(contacts.orgId, orgId)];
  if (opts.since) {
    whereClauses.push(sql`${contacts.updatedAt} >= ${opts.since}`);
  }
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(...whereClauses))
    .limit(limit);

  let processed = 0;
  for (const r of rows) {
    await computeTraits(orgId, r.id);
    processed += 1;
  }

  // Denormalise commerce aggregates back onto contact_engagement so segment
  // queries can filter on numeric columns without json access.
  await db.execute(sql`
    UPDATE contact_engagement ce
    SET total_orders = ct.orders,
        total_revenue = ct.revenue,
        last_order_at = ct.last_order_at,
        updated_at = now()
    FROM (
      SELECT contact_id,
             COUNT(*)::int AS orders,
             COALESCE(SUM(amount), 0)::numeric AS revenue,
             MAX(occurred_at) AS last_order_at
      FROM revenue_events
      WHERE org_id = ${orgId}::uuid
      GROUP BY contact_id
    ) ct
    WHERE ce.contact_id = ct.contact_id
  `);

  return { processed };
}

// ─── Helpers used by realtime recompute hooks ───────────────────────────────

/**
 * Called from the revenue-event write path to keep LTV fresh for a single
 * contact without running the whole trait set.
 */
export async function bumpCommerceTraits(
  orgId: string,
  contactId: string,
): Promise<void> {
  const values: Record<string, unknown> = {};
  values.ltv = await ltvTrait.compute(orgId, contactId);
  values.total_orders = await totalOrdersTrait.compute(orgId, contactId);
  const last = await lastPurchaseAtTrait.compute(orgId, contactId);
  if (last) values.last_purchase_at = last;
  const aov = await avgOrderValueTrait.compute(orgId, contactId);
  values.average_order_value = aov;

  await db
    .insert(contactTraits)
    .values({ contactId, orgId, values, version: String(Date.now()) })
    .onConflictDoUpdate({
      target: contactTraits.contactId,
      set: {
        values: sql`${contactTraits.values} || ${values}::jsonb`,
        version: String(Date.now()),
        computedAt: new Date(),
      },
    });

  // Cross-update engagement aggregates used for fast segment filters.
  await db.execute(sql`
    UPDATE contact_engagement
    SET total_orders = COALESCE(${values.total_orders as number}, 0),
        total_revenue = COALESCE(${values.ltv as number}, 0)::numeric,
        last_order_at = COALESCE(${last ? new Date(last as string) : null}, last_order_at),
        updated_at = now()
    WHERE contact_id = ${contactId}
  `);

  await invalidateProfile(orgId, contactId);
}

export async function getTraitDefinitions(orgId: string): Promise<Array<{ key: string; label: string }>> {
  return listTraitDefinitions(orgId).map((t) => ({ key: t.key, label: t.label }));
}

// Silence unused import for recompute helpers — cdpEvents is re-used by
// org-registered event-backed traits.
void cdpEvents;
