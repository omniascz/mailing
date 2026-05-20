/**
 * Blog + CTA pure helpers (#336/#340/#412).
 *
 * Slug generation, excerpt computation, read-time estimation, CTA variant
 * weighted selection, CTA CTR math. Runs without DB for unit-testing.
 */

// ─── Slug ───────────────────────────────────────────────────────────────────

/**
 * Convert a title to a URL-safe slug. Strips diacritics, lowercases, keeps
 * ASCII alphanumerics + hyphens, collapses whitespace.
 */
export function slugify(input: string, maxLength = 128): string {
  const trimmed = input.trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.slice(0, maxLength);
}

/** Generate a unique slug by suffixing `-2`, `-3`, … when collisions exist. */
export function uniqueSlug(base: string, existing: Set<string>, maxLength = 128): string {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const suffix = `-${i}`;
    const trimmed = base.slice(0, maxLength - suffix.length);
    const candidate = `${trimmed}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Extreme fallback — random suffix
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Excerpt + read time ───────────────────────────────────────────────────

/**
 * Extract a short excerpt from a Markdown/HTML body. Strips tags, collapses
 * whitespace, truncates to `maxChars` at the nearest word boundary.
 */
export function extractExcerpt(body: string, maxChars = 180): string {
  const stripped = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#_*`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= maxChars) return stripped;
  const clip = stripped.slice(0, maxChars);
  const lastSpace = clip.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? clip.slice(0, lastSpace) : clip).trim() + '…';
}

/**
 * Estimated read time in minutes assuming `wordsPerMinute` (default 220
 * which matches Medium's reader-facing estimate).
 */
export function estimateReadTimeMinutes(body: string, wordsPerMinute = 220): number {
  const text = body.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

// ─── Scheduled publish ─────────────────────────────────────────────────────

/** Is this post due to auto-publish right now? */
export function isDueToPublish(
  status: string,
  scheduledAt: Date | null,
  now: Date = new Date(),
): boolean {
  return status === 'scheduled' && scheduledAt !== null && scheduledAt.getTime() <= now.getTime();
}

// ─── CTA variant selection ─────────────────────────────────────────────────

export interface CtaVariant {
  id: string;
  weight: number;
}

/**
 * Weighted random selection of a CTA variant. `rng` defaults to Math.random
 * but can be overridden for deterministic tests.
 */
export function pickCtaVariant(
  variants: CtaVariant[],
  rng: () => number = Math.random,
): CtaVariant | null {
  if (variants.length === 0) return null;
  const eligible = variants.filter((v) => v.weight > 0);
  if (eligible.length === 0) return variants[0] ?? null;
  const totalWeight = eligible.reduce((s, v) => s + v.weight, 0);
  let roll = rng() * totalWeight;
  for (const v of eligible) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return eligible[eligible.length - 1] ?? null;
}

// ─── CTA CTR + conversion ─────────────────────────────────────────────────

export interface CtaStats {
  impressions: number;
  clicks: number;
  dismissals: number;
}

export interface CtaPerformance extends CtaStats {
  ctr: number;
  dismissRate: number;
  /** Click-through ratio among non-dismissed impressions. */
  engagementRate: number;
}

export function computeCtaPerformance(stats: CtaStats): CtaPerformance {
  const ctr = stats.impressions === 0 ? 0 : stats.clicks / stats.impressions;
  const dismissRate = stats.impressions === 0 ? 0 : stats.dismissals / stats.impressions;
  const engaged = stats.impressions - stats.dismissals;
  const engagementRate = engaged <= 0 ? 0 : stats.clicks / engaged;
  return {
    ...stats,
    ctr: round4(ctr),
    dismissRate: round4(dismissRate),
    engagementRate: round4(engagementRate),
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
