/**
 * Catalog insights — analytics over the product catalog: best-sellers, slow
 * movers, category share of revenue, average order value per category.
 *
 * `revenue_events` stores purchases only — it has no event-type discriminator —
 * so there is nothing to filter on; its line items live in `items` and its
 * timestamp is `occurred_at`. Each item is `{sku, name, qty, price}`: the key
 * is `qty`, which is what both write paths (revenue-attribution and the site
 * tracker) actually emit.
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
      SUM((i->>'qty')::int)::text AS units,
      SUM((i->>'price')::numeric * (i->>'qty')::int)::text AS revenue
    FROM revenue_events re
    CROSS JOIN LATERAL jsonb_array_elements(re.items) i
    LEFT JOIN products p ON p.org_id = re.org_id AND p.sku = i->>'sku'
    WHERE re.org_id = ${orgId}::uuid AND re.occurred_at >= ${since.toISOString()}::timestamptz
      AND i->>'sku' IS NOT NULL
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
      COALESCE(SUM((i->>'qty')::int), 0)::text AS units,
      COALESCE(SUM((i->>'price')::numeric * (i->>'qty')::int), 0)::text AS revenue
    FROM products p
    LEFT JOIN revenue_events re
      ON re.org_id = p.org_id AND re.occurred_at >= ${since.toISOString()}::timestamptz
    LEFT JOIN LATERAL jsonb_array_elements(re.items) i
      ON i->>'sku' = p.sku
    WHERE p.org_id = ${orgId}::uuid AND p.active
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
      SUM((i->>'qty')::int)::text AS units,
      SUM((i->>'price')::numeric * (i->>'qty')::int)::text AS revenue,
      COUNT(DISTINCT re.id)::text AS orders
    FROM revenue_events re
    CROSS JOIN LATERAL jsonb_array_elements(re.items) i
    JOIN products p ON p.org_id = re.org_id AND p.sku = i->>'sku'
    WHERE re.org_id = ${orgId}::uuid AND re.occurred_at >= ${since.toISOString()}::timestamptz
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
