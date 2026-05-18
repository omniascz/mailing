/**
 * Sitemap + robots.txt service (#291/#411).
 *
 * Collects a source list of public URLs and renders a standards-compliant
 * sitemap.xml. Callers provide the source list via `sources` so this module
 * doesn't couple to blog / landing / signup schemas that may arrive
 * incrementally (#412 adds blog + CTAs).
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { signupForms, blogPosts } from '../../db/schema/index.js';
import {
  renderSitemap,
  renderRobotsTxt,
  canonicalize,
  type SitemapEntry,
} from './pure.js';

export type SitemapSource = 'blog' | 'landings' | 'signup_forms';

export interface SitemapOptions {
  orgId: string;
  /** Public origin, e.g. `https://example.cz`. Required — sitemap URLs must be absolute. */
  origin: string;
  /** Which content sources to include. Defaults to all known sources. */
  sources?: readonly SitemapSource[];
  /** Additional hand-curated entries (eg homepage, /features, /pricing). */
  extras?: SitemapEntry[];
}

const DEFAULT_SOURCES: readonly SitemapSource[] = ['blog', 'landings', 'signup_forms'];

/**
 * Generate the sitemap XML for an org's public content. Safe to call from a
 * public route — queries are org-scoped and read-only.
 */
export async function generateSitemap(opts: SitemapOptions): Promise<string> {
  const sources = new Set(opts.sources ?? DEFAULT_SOURCES);
  const entries: SitemapEntry[] = [...(opts.extras ?? [])];

  if (sources.has('blog')) {
    const rows = await db
      .select({
        slug: blogPosts.slug,
        locale: blogPosts.locale,
        updatedAt: blogPosts.updatedAt,
        publishedAt: blogPosts.publishedAt,
      })
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.orgId, opts.orgId),
          eq(blogPosts.status, 'published'),
          isNull(blogPosts.deletedAt),
        ),
      );
    for (const row of rows) {
      const path =
        row.locale && row.locale !== 'en'
          ? `/${row.locale}/blog/${row.slug}`
          : `/blog/${row.slug}`;
      const loc = canonicalize(`${opts.origin}${path}`);
      if (!loc) continue;
      entries.push({
        loc,
        lastmod: row.publishedAt ?? row.updatedAt ?? undefined,
        changefreq: 'weekly',
        priority: 0.7,
      });
    }
  }

  // Landing pages schema arrives in a future task; signup forms exist today.
  if (sources.has('signup_forms')) {
    const rows = await db
      .select({ id: signupForms.id, updatedAt: signupForms.updatedAt })
      .from(signupForms)
      .where(eq(signupForms.orgId, opts.orgId));
    for (const row of rows) {
      const loc = canonicalize(`${opts.origin}/forms/${row.id}`);
      if (!loc) continue;
      entries.push({
        loc,
        lastmod: row.updatedAt ?? undefined,
        changefreq: 'monthly',
        priority: 0.4,
      });
    }
  }

  return renderSitemap(entries);
}

/** Generate robots.txt. Disallow `/admin`, `/api`, `/_*` by default. */
export function generateRobotsTxt(origin: string): string {
  return renderRobotsTxt({
    sitemapUrl: `${origin.replace(/\/$/, '')}/sitemap.xml`,
    disallow: ['/admin', '/api/', '/_next/', '/_private/'],
  });
}
