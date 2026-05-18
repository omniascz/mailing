/**
 * Social Media pure helpers (#293-#299/L4-1).
 *
 * Platform-specific character limits, hashtag extraction, and cross-post
 * body fitting. Runs without network/DB so tests can exercise formatting
 * without hitting OAuth APIs.
 */

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'x'
  | 'tiktok'
  | 'threads';

/** Per-platform post length ceilings (characters). Twitter/X ceiling applies
 *  before counting hashtags. LinkedIn is the generous upper bound. */
export const POST_LIMITS: Record<SocialPlatform, number> = {
  twitter: 280,
  x: 280,
  threads: 500,
  instagram: 2200,
  tiktok: 2200,
  facebook: 63_206,
  linkedin: 3000,
};

/** Maximum number of hashtags per platform (editorial guidance, not hard API). */
export const HASHTAG_LIMITS: Record<SocialPlatform, number> = {
  twitter: 2,
  x: 2,
  threads: 5,
  linkedin: 5,
  facebook: 3,
  instagram: 30,
  tiktok: 5,
};

/** Is this platform supported? */
export function isSupportedPlatform(p: string): p is SocialPlatform {
  return p in POST_LIMITS;
}

// ─── Hashtag extraction ─────────────────────────────────────────────────────

/**
 * Pull hashtags from a body. Returns them in order of first appearance with
 * duplicates removed. Case is preserved (InstagramStyle matters to the API).
 */
export function extractHashtags(body: string): string[] {
  const matches = body.matchAll(/(?:^|[\s\n])(#[\p{L}0-9_]+)/gu);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const tag = m[1]!;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Merge a default hashtag set into the body at the end while respecting
 * the platform's hashtag ceiling. Existing hashtags in the body count
 * toward the limit.
 */
export function mergeHashtags(
  body: string,
  defaults: string[],
  platform: SocialPlatform,
): string {
  const existing = extractHashtags(body);
  const limit = HASHTAG_LIMITS[platform];
  if (existing.length >= limit) return body;
  const room = limit - existing.length;

  const existingKeys = new Set(existing.map((t) => t.toLowerCase()));
  const extras = defaults
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t) => !existingKeys.has(t.toLowerCase()))
    .slice(0, room);
  if (extras.length === 0) return body;

  return `${body.replace(/\s+$/, '')}\n\n${extras.join(' ')}`;
}

// ─── Cross-post fitting ─────────────────────────────────────────────────────

/**
 * Truncate a body to fit a platform's character limit. Preserves the last
 * word boundary and appends `…` when clipped. Returns the original body if
 * it already fits.
 */
export function fitForPlatform(body: string, platform: SocialPlatform): string {
  const limit = POST_LIMITS[platform];
  if (body.length <= limit) return body;
  // Reserve 1 char for the ellipsis
  const clip = body.slice(0, limit - 1);
  const lastSpace = clip.lastIndexOf(' ');
  const cut = lastSpace > limit * 0.6 ? clip.slice(0, lastSpace) : clip;
  return `${cut.trimEnd()}…`;
}

// ─── Best-time scoring ──────────────────────────────────────────────────────

export interface EngagementHistogramEntry {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  /** 0-23 */
  hour: number;
  /** Average engagement score during this slot (impressions-normalised). */
  score: number;
}

export interface BestTimeSlot {
  dayOfWeek: number;
  hour: number;
  score: number;
}

/**
 * Pick the top-N slots from an engagement histogram. Ties broken by earlier
 * hour then day. Used for "best time to post" dashboards.
 */
export function pickBestTimeSlots(
  histogram: EngagementHistogramEntry[],
  topN = 3,
): BestTimeSlot[] {
  const sorted = [...histogram].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.dayOfWeek - b.dayOfWeek;
  });
  return sorted.slice(0, topN);
}

// ─── Cross-post validity ───────────────────────────────────────────────────

export interface CrossPostCheck {
  platform: SocialPlatform;
  fits: boolean;
  charsOver: number;
  hashtagsOver: number;
}

/**
 * Check a draft against every target platform and report which ones it
 * fits (helps the editor warn "truncated on Twitter" before send).
 */
export function validateCrossPost(
  body: string,
  platforms: SocialPlatform[],
): CrossPostCheck[] {
  const tags = extractHashtags(body);
  return platforms.map((p) => {
    const charsOver = Math.max(0, body.length - POST_LIMITS[p]);
    const hashtagsOver = Math.max(0, tags.length - HASHTAG_LIMITS[p]);
    return {
      platform: p,
      fits: charsOver === 0 && hashtagsOver === 0,
      charsOver,
      hashtagsOver,
    };
  });
}
