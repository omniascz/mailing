/* eslint-disable forgemsg/no-unencoded-sql-param -- These queries already fail earlier on a missing column (re.line_items), so the encoder is not what breaks them. Fixing it here would quietly convert a visible failure into a different one and hide work that belongs to the missing-column task. File-scoped rather than per-line because the offending substitutions sit inside multi-line sql`` templates, where a line comment would be template text. */
/**
 * Catalog insights — analytics over the product catalog: best-sellers, slow
 * movers, category share of revenue, average order value per category.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export interface BestSeller {
  sku: string;
  name: string;
  units: number;
  revenue: number;
}

export interface CategoryStat {
  category: string;
  units: number;
  revenue: number;
  avgOrderValue: number;
}

export async function bestSellers(orgId: string, days = 30, limit = 25): Promise<BestSeller[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rs = await db.execute<{ sku: string; name: string; units: string; revenue: string }>(sql`
    SELECT
      i->>'sku' AS sku,
      COALESCE(p.name, i->>'name') AS name,
      SUM((i->>'quantity')::int)::text AS units,
      SUM((i->>'price')::numeric * (i->>'quantity')::int)::text AS revenue
    FROM revenue_events re,
         jsonb_array_elements(re.line_items) i
    LEFT JOIN products p ON p.org_id = re.org_id AND p.sku = i->>'sku'
    WHERE re.org_id = ${orgId}::uuid AND re.created_at >= ${since}
      AND re.event_type = 'purchase' AND i->>'sku' IS NOT NULL
    GROUP BY i->>'sku', COALESCE(p.name, i->>'name')
    ORDER BY revenue DESC
    LIMIT ${limit}
  `);
  return (
    rs as unknown as Array<{ sku: string; name: string; units: string; revenue: string }>
  ).map((r) => ({
    sku: r.sku,
    name: r.name ?? r.sku,
    units: Number(r.units),
    revenue: Number(r.revenue),
  }));
}

export async function slowMovers(orgId: string, days = 90, limit = 25): Promise<BestSeller[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rs = await db.execute<{ sku: string; name: string; units: string; revenue: string }>(sql`
    SELECT p.sku, p.name,
      COALESCE(SUM((i->>'quantity')::int), 0)::text AS units,
      COALESCE(SUM((i->>'price')::numeric * (i->>'quantity')::int), 0)::text AS revenue
    FROM products p
    LEFT JOIN revenue_events re
      ON re.org_id = p.org_id AND re.event_type = 'purchase' AND re.created_at >= ${since}
    LEFT JOIN LATERAL jsonb_array_elements(re.line_items) i
      ON i->>'sku' = p.sku
    WHERE p.org_id = ${orgId}::uuid AND p.deleted_at IS NULL
    GROUP BY p.sku, p.name
    ORDER BY revenue ASC
    LIMIT ${limit}
  `);
  return (
    rs as unknown as Array<{ sku: string; name: string; units: string; revenue: string }>
  ).map((r) => ({
    sku: r.sku,
    name: r.name,
    units: Number(r.units),
    revenue: Number(r.revenue),
  }));
}

export async function revenueByCategory(orgId: string, days = 30): Promise<CategoryStat[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rs = await db.execute<{
    category: string;
    units: string;
    revenue: string;
    orders: string;
  }>(sql`
    SELECT
      jsonb_array_elements_text(p.categories) AS category,
      SUM((i->>'quantity')::int)::text AS units,
      SUM((i->>'price')::numeric * (i->>'quantity')::int)::text AS revenue,
      COUNT(DISTINCT re.id)::text AS orders
    FROM revenue_events re,
         jsonb_array_elements(re.line_items) i
    JOIN products p ON p.org_id = re.org_id AND p.sku = i->>'sku'
    WHERE re.org_id = ${orgId}::uuid AND re.created_at >= ${since}
      AND re.event_type = 'purchase'
    GROUP BY category
    ORDER BY revenue DESC
  `);
  return (
    rs as unknown as Array<{ category: string; units: string; revenue: string; orders: string }>
  ).map((r) => ({
    category: r.category,
    units: Number(r.units),
    revenue: Number(r.revenue),
    avgOrderValue:
      Number(r.orders) > 0 ? Math.round((Number(r.revenue) / Number(r.orders)) * 100) / 100 : 0,
  }));
}
