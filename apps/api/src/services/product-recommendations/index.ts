/**
 * Product recommendations — given a contact or a reference product, return
 * a ranked list of product SKUs. Uses AI (Claude Haiku) for personalisation
 * when a contact history is available; otherwise falls back to rule-based
 * category / tag similarity.
 */

import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { products, revenueEvents, type Product } from '../../db/schema/index.js';
import { callClaude, parseJsonSafe } from '../../lib/ai-client.js';

interface Recommendation {
  sku: string;
  name: string;
  score: number;
  reason: string;
}

/** Heuristic recommender — "customers also bought" via shared order history. */
export async function alsoBought(orgId: string, sku: string, limit = 6): Promise<Recommendation[]> {
  const rs = await db.execute<{ sku: string; name: string; count: string }>(sql`
    WITH owners AS (
      SELECT DISTINCT contact_id
      FROM revenue_events, jsonb_array_elements(items) AS it
      WHERE org_id = ${orgId}::uuid AND it->>'sku' = ${sku}
    )
    SELECT p.sku, p.name, COUNT(*)::text AS count
    FROM revenue_events r, jsonb_array_elements(r.items) AS it
    JOIN products p ON p.sku = it->>'sku' AND p.org_id = ${orgId}::uuid
    WHERE r.contact_id IN (SELECT contact_id FROM owners)
      AND it->>'sku' <> ${sku}
    GROUP BY p.sku, p.name
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `);
  return (rs as unknown as Array<{ sku: string; name: string; count: string }>).map((r) => ({
    sku: r.sku, name: r.name, score: Number(r.count), reason: 'Customers who bought this also bought',
  }));
}

/** Rule-based fallback — same-category top sellers. */
export async function topInCategory(orgId: string, category: string, limit = 6): Promise<Recommendation[]> {
  const rs = await db.execute<{ sku: string; name: string }>(sql`
    SELECT p.sku, p.name
    FROM products p
    WHERE p.org_id = ${orgId}::uuid AND p.active = TRUE
      AND p.categories @> to_jsonb(ARRAY[${category}])
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `);
  return (rs as unknown as Array<{ sku: string; name: string }>).map((r, i) => ({
    sku: r.sku, name: r.name, score: limit - i, reason: `Popular in ${category}`,
  }));
}

/** AI-personalised recommender based on a contact's purchase history. */
export async function personalisedFor(orgId: string, contactId: string, limit = 6): Promise<Recommendation[]> {
  const history = await db
    .select({ items: revenueEvents.items })
    .from(revenueEvents)
    .where(and(eq(revenueEvents.orgId, orgId), eq(revenueEvents.contactId, contactId)))
    .orderBy(desc(revenueEvents.occurredAt))
    .limit(10);

  const ownedSkus = new Set<string>();
  for (const row of history) for (const it of row.items ?? []) ownedSkus.add(it.sku);

  const catalogue = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.active, true)))
    .limit(200);

  const candidates: Product[] = catalogue.filter((p) => !ownedSkus.has(p.sku));
  if (candidates.length === 0) return [];

  try {
    const result = await callClaude({
      tenantId: orgId,
      feature: 'other',
      system: `You recommend products to a shopper. Reply with JSON array of
{sku, name, score (0-100), reason} — up to ${limit} items. No prose.`,
      user: `OWNED SKUS: ${[...ownedSkus].slice(0, 20).join(', ')}
CATALOGUE (sku | name | categories):
${candidates.slice(0, 60).map((p) => `${p.sku} | ${p.name} | ${(p.categories ?? []).join(',')}`).join('\n')}`,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 800,
    });
    const parsed = parseJsonSafe<Recommendation[]>(result.text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, limit);
  } catch {
    // fall through to rule-based
  }

  // Fallback: pick most common category from history, then top in category.
  const cats = new Map<string, number>();
  for (const p of catalogue) for (const c of p.categories ?? []) {
    if (ownedSkus.has(p.sku)) cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return topInCategory(orgId, top, limit);
  return candidates.slice(0, limit).map((p, i) => ({
    sku: p.sku, name: p.name, score: limit - i, reason: 'New arrival',
  }));
}

/** Simple CRUD for the catalogue — enough to back recommendations and merge-tag blocks. */
export async function upsertProduct(orgId: string, data: {
  sku: string; name: string; description?: string; price: number;
  currency?: string; imageUrl?: string; url?: string;
  categories?: string[]; tags?: string[]; stock?: number;
}) {
  const [existing] = await db.select().from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, data.sku))).limit(1);

  if (existing) {
    const [row] = await db.update(products).set({
      ...data, price: data.price.toFixed(2),
      updatedAt: new Date(),
    } as never).where(eq(products.id, existing.id)).returning();
    return row!;
  }
  const [row] = await db.insert(products).values({
    orgId, sku: data.sku, name: data.name,
    description: data.description,
    price: data.price.toFixed(2),
    currency: data.currency ?? 'USD',
    imageUrl: data.imageUrl, url: data.url,
    categories: data.categories ?? [], tags: data.tags ?? [],
    stock: data.stock,
  }).returning();
  return row!;
}

export async function listProducts(orgId: string): Promise<Product[]> {
  return db.select().from(products).where(eq(products.orgId, orgId)).limit(500);
}

export async function bulkUpsertProducts(orgId: string, items: Parameters<typeof upsertProduct>[1][]) {
  const results: Product[] = [];
  for (const it of items) results.push(await upsertProduct(orgId, it));
  return results;
}

void inArray; // may be used in future filters
