/**
 * SEO pure helpers (#289/#411).
 *
 * HTML extractors + readability + issue detection. Runs purely on input
 * strings — no DB, no fetch, no Claude. The service in `on-page-audit.ts`
 * downloads the URL and delegates the math to this module.
 */

// ─── HTML extractors ───────────────────────────────────────────────────────

/** Extract the first occurrence of a tag's inner text. */
export function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]*)`, 'i'));
  return m && m[1] ? m[1].trim() : null;
}

/** Extract a named `<meta>` tag's content attribute. */
export function extractMeta(html: string, name: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'));
  return m && m[1] ? m[1].trim() : null;
}

/** Extract every occurrence of a tag's inner text. */
export function extractAll(html: string, tag: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)`, 'gi'))]
    .map((m) => (m[1] ?? '').trim())
    .filter(Boolean);
}

/** Extract same-host absolute href URLs. */
export function extractInternalLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  return [...html.matchAll(/<a[^>]+href=["']([^"'#?]*)["']/gi)]
    .map((m) => {
      try {
        const u = new URL(m[1] ?? '', base);
        return u.hostname === base.hostname ? u.href : null;
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u !== null);
}

/** Extract `<img>` tags with their src + alt. */
export function extractImages(html: string): Array<{ src: string; alt: string | null }> {
  return [...html.matchAll(/<img[^>]+>/gi)].map((m) => {
    const tag = m[0];
    const srcM = tag.match(/src=["']([^"']*)/i);
    const altM = tag.match(/alt=["']([^"']*)/i);
    return { src: srcM?.[1] ?? '', alt: altM?.[1] ?? null };
  });
}

/** Word count after stripping tags. */
export function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(' ').filter(Boolean).length;
}

// ─── Readability ───────────────────────────────────────────────────────────

/** Flesch-Kincaid reading ease (rough estimate from HTML). 0-100, higher = easier. */
export function fleschKincaid(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ');
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const syllables = words.reduce(
    (sum, w) => sum + Math.max(1, w.replace(/[^aeiouAEIOU]/g, '').length),
    0,
  );
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
}

export function readabilityLabel(score: number): 'easy' | 'medium' | 'hard' {
  if (score >= 70) return 'easy';
  if (score >= 50) return 'medium';
  return 'hard';
}

// ─── Issue detection ──────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';
export interface SeoIssue {
  type: string;
  severity: IssueSeverity;
  message: string;
}

export interface AuditSignals {
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  h1Count: number;
  wordCount: number;
  readabilityScore: number;
  images: Array<{ src: string; alt: string | null }>;
  internalLinks: string[];
}

/**
 * Detect SEO issues in extracted page signals. Rules cover the HubSpot/Moz
 * on-page checklist: title/meta/H1 presence + length bands, thin content,
 * readability, alt text, internal linking.
 */
export function detectIssues(data: AuditSignals): SeoIssue[] {
  const issues: SeoIssue[] = [];

  if (!data.title) {
    issues.push({ type: 'missing_title', severity: 'error', message: 'Page has no <title> tag' });
  } else if (data.title.length < 30) {
    issues.push({
      type: 'short_title',
      severity: 'warning',
      message: `Title too short (${data.title.length} chars, recommend 30-60)`,
    });
  } else if (data.title.length > 60) {
    issues.push({
      type: 'long_title',
      severity: 'warning',
      message: `Title too long (${data.title.length} chars, recommend 30-60)`,
    });
  }

  if (!data.metaDesc) {
    issues.push({ type: 'missing_meta_desc', severity: 'error', message: 'No meta description' });
  } else if (data.metaDesc.length < 70) {
    issues.push({
      type: 'short_meta_desc',
      severity: 'warning',
      message: `Meta description too short (${data.metaDesc.length} chars)`,
    });
  } else if (data.metaDesc.length > 160) {
    issues.push({
      type: 'long_meta_desc',
      severity: 'warning',
      message: `Meta description too long (${data.metaDesc.length} chars)`,
    });
  }

  if (!data.h1) {
    issues.push({ type: 'missing_h1', severity: 'error', message: 'No H1 tag found' });
  } else if (data.h1Count > 1) {
    issues.push({
      type: 'multiple_h1',
      severity: 'warning',
      message: `${data.h1Count} H1 tags found (should be 1)`,
    });
  }

  if (data.wordCount < 300) {
    issues.push({
      type: 'thin_content',
      severity: 'warning',
      message: `Low word count (${data.wordCount} words)`,
    });
  }

  if (data.readabilityScore < 30) {
    issues.push({
      type: 'hard_to_read',
      severity: 'warning',
      message: 'Content is difficult to read',
    });
  }

  const imagesWithoutAlt = data.images.filter((i) => !i.alt || i.alt.trim() === '').length;
  if (imagesWithoutAlt > 0) {
    issues.push({
      type: 'missing_alt',
      severity: 'warning',
      message: `${imagesWithoutAlt} image(s) missing alt text`,
    });
  }

  if (data.internalLinks.length === 0) {
    issues.push({
      type: 'no_internal_links',
      severity: 'info',
      message: 'No internal links found',
    });
  }

  return issues;
}

/** Score from the issue list. 100 = perfect, errors -15, warnings -5, info -1. */
export function scoreFromIssues(issues: SeoIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 15;
    else if (issue.severity === 'warning') score -= 5;
    else score -= 1;
  }
  return Math.max(0, score);
}

// ─── Sitemap + robots + canonical (#291/#411) ──────────────────────────────

export interface SitemapEntry {
  loc: string;
  lastmod?: string | Date;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/** Render a sitemap.xml string per https://www.sitemaps.org/protocol.html */
export function renderSitemap(entries: SitemapEntry[]): string {
  const rows = entries
    .map((e) => {
      const parts = [`  <url>`, `    <loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) {
        const d = e.lastmod instanceof Date ? e.lastmod : new Date(e.lastmod);
        parts.push(`    <lastmod>${d.toISOString().slice(0, 10)}</lastmod>`);
      }
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority != null) {
        parts.push(`    <priority>${clampPriority(e.priority).toFixed(1)}</priority>`);
      }
      parts.push(`  </url>`);
      return parts.join('\n');
    })
    .join('\n');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    rows,
    `</urlset>`,
  ].join('\n');
}

/** Render a minimal robots.txt pointing to the sitemap. */
export function renderRobotsTxt(options: {
  sitemapUrl: string;
  disallow?: string[];
  allow?: string[];
  userAgent?: string;
}): string {
  const ua = options.userAgent ?? '*';
  const lines = [`User-agent: ${ua}`];
  for (const path of options.allow ?? []) lines.push(`Allow: ${path}`);
  for (const path of options.disallow ?? []) lines.push(`Disallow: ${path}`);
  lines.push('');
  lines.push(`Sitemap: ${options.sitemapUrl}`);
  return lines.join('\n');
}

/**
 * Compute the canonical URL for a page: drop tracking params + fragment,
 * lowercase host, strip trailing slash unless root.
 */
export function canonicalize(
  url: string,
  trackingParams: string[] = DEFAULT_TRACKING_PARAMS,
): string | null {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    for (const p of trackingParams) u.searchParams.delete(p);
    let out = u.toString();
    // Normalize trailing slash (but keep for root path)
    if (out.endsWith('/') && u.pathname !== '/') {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return null;
  }
}

export const DEFAULT_TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  '_hsenc',
  '_hsmi',
];

function clampPriority(p: number): number {
  if (Number.isNaN(p)) return 0.5;
  return Math.max(0, Math.min(1, p));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
