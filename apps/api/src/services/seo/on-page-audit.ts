/**
 * On-page SEO audit (#289).
 * Fetches URL, parses HTML, extracts: title, meta, H1-H6, alt texts,
 * word count, readability (Flesch-Kincaid estimate), internal links.
 * Scores issues 0-100 and persists result.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { seoAuditResults } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ── Simple HTML parsing helpers (no heavy dep, regex-based) ──────────────────

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]*)`, 'i'));
  return m?.[1]?.trim() ?? null;
}

function extractMeta(html: string, name: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'));
  return m?.[1]?.trim() ?? null;
}

function extractAll(html: string, tag: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)`, 'gi'))].map(m => m[1]?.trim() ?? '').filter(Boolean);
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  return [...html.matchAll(/<a[^>]+href=["']([^"'#?]*)["']/gi)]
    .map(m => {
      const href = m[1];
      if (!href) return null;
      try {
        const u = new URL(href, base);
        return u.hostname === base.hostname ? u.href : null;
      } catch { return null; }
    })
    .filter((u): u is string => u !== null);
}

function extractImages(html: string): Array<{ src: string; alt: string | null }> {
  return [...html.matchAll(/<img[^>]+>/gi)].map(m => {
    const srcM = m[0].match(/src=["']([^"']*)/i);
    const altM = m[0].match(/alt=["']([^"']*)/i);
    return { src: srcM?.[1] ?? '', alt: altM?.[1] ?? null };
  });
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.split(' ').filter(Boolean).length;
}

function fleschKincaid(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ');
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((sum, w) => sum + Math.max(1, w.replace(/[^aeiouAEIOU]/g, '').length), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
}

function readabilityLabel(score: number): string {
  if (score >= 70) return 'easy';
  if (score >= 50) return 'medium';
  return 'hard';
}

// ── Issue detection ───────────────────────────────────────────────────────────

interface Issue { type: string; severity: 'error' | 'warning' | 'info'; message: string }

function detectIssues(data: {
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  h1Count: number;
  wordCount: number;
  readabilityScore: number;
  images: Array<{ src: string; alt: string | null }>;
  internalLinks: string[];
}): Issue[] {
  const issues: Issue[] = [];

  if (!data.title) issues.push({ type: 'missing_title', severity: 'error', message: 'Page has no <title> tag' });
  else if (data.title.length < 30) issues.push({ type: 'short_title', severity: 'warning', message: `Title too short (${data.title.length} chars, recommend 30-60)` });
  else if (data.title.length > 60) issues.push({ type: 'long_title', severity: 'warning', message: `Title too long (${data.title.length} chars, recommend 30-60)` });

  if (!data.metaDesc) issues.push({ type: 'missing_meta_desc', severity: 'error', message: 'No meta description' });
  else if (data.metaDesc.length < 70) issues.push({ type: 'short_meta_desc', severity: 'warning', message: `Meta description too short (${data.metaDesc.length} chars)` });
  else if (data.metaDesc.length > 160) issues.push({ type: 'long_meta_desc', severity: 'warning', message: `Meta description too long (${data.metaDesc.length} chars)` });

  if (!data.h1) issues.push({ type: 'missing_h1', severity: 'error', message: 'No H1 tag found' });
  else if (data.h1Count > 1) issues.push({ type: 'multiple_h1', severity: 'warning', message: `${data.h1Count} H1 tags found (should be 1)` });

  if (data.wordCount < 300) issues.push({ type: 'thin_content', severity: 'warning', message: `Low word count (${data.wordCount} words)` });

  if (data.readabilityScore < 30) issues.push({ type: 'hard_to_read', severity: 'warning', message: 'Content is difficult to read' });

  const imagesWithoutAlt = data.images.filter(i => !i.alt || i.alt.trim() === '').length;
  if (imagesWithoutAlt > 0) issues.push({ type: 'missing_alt', severity: 'warning', message: `${imagesWithoutAlt} image(s) missing alt text` });

  if (data.internalLinks.length === 0) issues.push({ type: 'no_internal_links', severity: 'info', message: 'No internal links found' });

  return issues;
}

function scoreFromIssues(issues: Issue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 15;
    else if (issue.severity === 'warning') score -= 5;
    else score -= 1;
  }
  return Math.max(0, score);
}

// ── Main audit function ───────────────────────────────────────────────────────

export async function auditUrl(orgId: string, url: string) {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ForgeMsg-SEO-Auditor/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw AppError.badRequest(`Failed to fetch URL: HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest(`Could not reach URL: ${(err as Error).message}`);
  }

  const title = extractTag(html, 'title');
  const metaDesc = extractMeta(html, 'description');
  const h1List = extractAll(html, 'h1');
  const headings = {
    h1: h1List,
    h2: extractAll(html, 'h2'),
    h3: extractAll(html, 'h3'),
    h4: extractAll(html, 'h4'),
    h5: extractAll(html, 'h5'),
    h6: extractAll(html, 'h6'),
  };
  const wordCount = countWords(html);
  const readScore = fleschKincaid(html);
  const images = extractImages(html);
  const internalLinks = [...new Set(extractLinks(html, url))];

  const issues = detectIssues({
    title,
    metaDesc,
    h1: h1List[0] ?? null,
    h1Count: h1List.length,
    wordCount,
    readabilityScore: readScore,
    images,
    internalLinks,
  });

  const score = scoreFromIssues(issues);
  const readability = readabilityLabel(readScore);

  const [row] = await db
    .insert(seoAuditResults)
    .values({
      orgId,
      url,
      title,
      metaDesc,
      h1: h1List[0] ?? null,
      wordCount,
      readability,
      score,
      issues,
      headings,
      internalLinks,
      images,
    })
    .returning();

  return row;
}

export async function listAudits(orgId: string, url?: string, limit = 20) {
  const conditions = url
    ? and(eq(seoAuditResults.orgId, orgId), eq(seoAuditResults.url, url))
    : eq(seoAuditResults.orgId, orgId);

  return db
    .select()
    .from(seoAuditResults)
    .where(conditions)
    .orderBy(desc(seoAuditResults.auditedAt))
    .limit(limit);
}
