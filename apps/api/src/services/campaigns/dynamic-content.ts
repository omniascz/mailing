/**
 * Server-side dynamic content engine.
 * Resolves <!-- DC:block-id --> placeholders in email HTML at open time
 * by evaluating variant conditions against real-time data.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dynamicContentBlocks, type DcVariant } from '../../db/schema/dynamic-content.js';
import { redis } from '../../lib/redis.js';

interface ResolutionContext {
  openedAt?: Date;
  contactProps?: Record<string, unknown>;
  geoCountry?: string;
  geoCity?: string;
  liveData?: Record<string, unknown>; // fetched from dataSourceUrl
}

function evalCondition(
  cond: DcVariant['conditions'][number],
  ctx: ResolutionContext,
): boolean {
  const now = ctx.openedAt ?? new Date();
  const hour = now.getHours();
  const dow = now.getDay(); // 0=Sunday

  let actual: unknown;

  switch (cond.triggerType) {
    case 'time_of_day': actual = hour; break;
    case 'day_of_week': actual = dow; break;
    case 'days_since_send': actual = ctx.liveData?.['days_since_send'] ?? 0; break;
    case 'stock_level': actual = ctx.liveData?.['stock_level'] ?? 999; break;
    case 'weather': actual = ctx.liveData?.['condition'] ?? 'unknown'; break;
    case 'geo': actual = cond.value && String(cond.value).includes('city') ? ctx.geoCity : ctx.geoCountry; break;
    case 'contact_prop': actual = ctx.contactProps?.[String(cond.value)]; break;
    case 'countdown': actual = ctx.liveData?.['seconds_remaining'] ?? 0; break;
    case 'live_price': actual = ctx.liveData?.['price'] ?? 0; break;
    case 'custom_api': actual = ctx.liveData?.['value'] ?? null; break;
    default: return false;
  }

  const v = cond.value;
  switch (cond.operator) {
    case 'eq': return String(actual) === String(v);
    case 'neq': return String(actual) !== String(v);
    case 'gt': return Number(actual) > Number(v);
    case 'lt': return Number(actual) < Number(v);
    case 'in': return Array.isArray(v) && v.map(String).includes(String(actual));
    case 'contains': return String(actual).includes(String(v));
    default: return false;
  }
}

async function fetchLiveData(url: string, headers: Record<string, string>, cacheKey: string, ttlSeconds: number): Promise<Record<string, unknown>> {
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as Record<string, unknown>;

  try {
    const resp = await fetch(url, { headers });
    const data = await resp.json() as Record<string, unknown>;
    await redis.set(cacheKey, JSON.stringify(data), 'EX', ttlSeconds);
    return data;
  } catch {
    return {};
  }
}

function resolveVariant(variants: DcVariant[], ctx: ResolutionContext): DcVariant | null {
  const sorted = [...variants].sort((a, b) => a.priority - b.priority);
  for (const variant of sorted) {
    if (variant.conditions.length === 0) return variant;
    const allMatch = variant.conditions.every((c) => evalCondition(c, ctx));
    if (allMatch) return variant;
  }
  return null;
}

/** Resolve a single dynamic content block by placeholder tag. */
export async function resolveBlock(
  orgId: string,
  placeholderTag: string,
  ctx: ResolutionContext = {},
): Promise<string> {
  const [block] = await db
    .select()
    .from(dynamicContentBlocks)
    .where(and(
      eq(dynamicContentBlocks.orgId, orgId),
      eq(dynamicContentBlocks.placeholderTag, placeholderTag),
      eq(dynamicContentBlocks.active, true),
    ))
    .limit(1);

  if (!block) return '';

  // Fetch live data if needed
  let liveData: Record<string, unknown> = {};
  if (block.dataSourceUrl) {
    const ck = `dc:live:${block.id}`;
    liveData = await fetchLiveData(
      block.dataSourceUrl,
      (block.dataSourceHeaders ?? {}) as Record<string, string>,
      ck,
      block.cacheTtlSeconds,
    );
  }

  const resolvedCtx = { ...ctx, liveData };
  const variant = resolveVariant(block.variants, resolvedCtx);
  const html = variant?.contentHtml ?? block.fallbackHtml;

  // Track impression (fire-and-forget)
  db.execute(
    `UPDATE dynamic_content_blocks SET impressions = impressions + 1 WHERE id = '${block.id}'`,
  ).catch(() => {});

  return html;
}

/** Replace all <!-- DC:tag --> placeholders in an email HTML string. */
export async function resolveDynamicContent(
  orgId: string,
  emailHtml: string,
  ctx: ResolutionContext = {},
): Promise<string> {
  const placeholderRegex = /<!--\s*DC:([\w-]+)\s*-->/g;
  const matches = [...emailHtml.matchAll(placeholderRegex)];
  if (matches.length === 0) return emailHtml;

  const unique = [...new Set(matches.map((m) => m[1]).filter((t): t is string => t !== undefined))];
  const resolved = await Promise.all(unique.map((tag) => resolveBlock(orgId, tag, ctx)));
  const map = Object.fromEntries(unique.map((tag, i) => [tag, resolved[i]]));

  return emailHtml.replace(placeholderRegex, (_, tag: string) => map[tag] ?? '');
}
