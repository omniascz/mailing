/**
 * Email accessibility checker — hybrid approach:
 *   1. Fast rule-based checks (no API call needed) for common issues
 *   2. Claude Haiku for contextual/semantic issues (alt text quality, heading hierarchy, etc.)
 *
 * Returns an array of issues with severity and suggestions.
 */

import crypto from 'node:crypto';
import { redis } from '../../lib/redis.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CACHE_TTL = 60 * 60 * 12; // 12 h

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface AccessibilityIssue {
  issue: string;
  severity: IssueSeverity;
  /** Short HTML snippet or element description that triggered this issue */
  element?: string;
  suggestion: string;
}

export interface AccessibilityReport {
  issues: AccessibilityIssue[];
  /** Percentage of checks passed (0–100) */
  score: number;
}

// ---------------------------------------------------------------------------
// Rule-based checks
// ---------------------------------------------------------------------------

function extractImages(html: string): { src: string; alt: string }[] {
  const imgs: { src: string; alt: string }[] = [];
  const re = /<img([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1] ?? '';
    const src = (tag.match(/src\s*=\s*["']([^"']+)["']/i) ?? [])[1] ?? '';
    const alt = (tag.match(/alt\s*=\s*["']([^"']*)["']/i) ?? [])[1] ?? null;
    imgs.push({ src, alt: alt === null ? '__missing__' : alt });
  }
  return imgs;
}

function ruleBasedChecks(html: string): { issues: AccessibilityIssue[]; totalChecks: number } {
  const issues: AccessibilityIssue[] = [];
  let totalChecks = 0;

  // 1. lang attribute on <html>
  totalChecks++;
  if (!/<html[^>]+lang\s*=/i.test(html)) {
    issues.push({
      issue: 'Missing lang attribute on <html> element',
      severity: 'error',
      element: '<html>',
      suggestion: 'Add lang="cs" (or appropriate locale) to the <html> tag for screen readers',
    });
  }

  // 2. Alt texts
  const images = extractImages(html);
  totalChecks += images.length;
  for (const img of images) {
    if (img.alt === '__missing__') {
      issues.push({
        issue: 'Image missing alt attribute',
        severity: 'error',
        element: `<img src="${img.src.slice(0, 60)}">`,
        suggestion: 'Add a descriptive alt attribute. For decorative images use alt=""',
      });
    }
  }

  // 3. Role on presentation tables
  totalChecks++;
  const tables = html.match(/<table[^>]*>/gi) ?? [];
  const tablesWithoutRole = tables.filter((t) => !/role\s*=/i.test(t));
  if (tablesWithoutRole.length > 0) {
    issues.push({
      issue: `${tablesWithoutRole.length} table(s) missing role="presentation"`,
      severity: 'warning',
      element: '<table>',
      suggestion: 'Add role="presentation" to layout tables so screen readers skip them',
    });
  }

  // 4. Links with no text
  totalChecks++;
  const emptyLinks = html.match(/<a[^>]+>\s*<\/a>/gi) ?? [];
  if (emptyLinks.length > 0) {
    issues.push({
      issue: `${emptyLinks.length} link(s) have no visible text`,
      severity: 'error',
      element: '<a href="..."></a>',
      suggestion: 'Provide descriptive link text or an aria-label so screen readers can announce it',
    });
  }

  // 5. "Click here" / "Read more" generic link text
  totalChecks++;
  const genericLinkRe = /<a[^>]+>[\s\r\n]*(click here|read more|here|více|klikněte zde)[\s\r\n]*<\/a>/gi;
  const genericLinks = html.match(genericLinkRe) ?? [];
  if (genericLinks.length > 0) {
    issues.push({
      issue: 'Generic link text ("click here", "read more") detected',
      severity: 'warning',
      element: (genericLinks[0] ?? '').slice(0, 80),
      suggestion: 'Use descriptive link text that makes sense out of context',
    });
  }

  // 6. Very small font sizes (below 11px)
  totalChecks++;
  const smallFonts = html.match(/font-size\s*:\s*([0-9]+)px/gi) ?? [];
  const tooSmall = smallFonts.filter((f) => {
    const n = parseInt(f.replace(/[^0-9]/g, ''), 10);
    return n > 0 && n < 11;
  });
  if (tooSmall.length > 0) {
    issues.push({
      issue: `Font sizes below 11px detected (${tooSmall.length} instance(s))`,
      severity: 'warning',
      element: tooSmall[0],
      suggestion: 'Use at least 14px body text and 11px for legal/footer text',
    });
  }

  return { issues, totalChecks };
}

// ---------------------------------------------------------------------------
// AI-powered checks (contrast, alt text quality, heading hierarchy)
// ---------------------------------------------------------------------------

const AI_SYSTEM = `You are an email accessibility auditor (WCAG 2.1 AA for email clients).

Analyse the HTML and return ONLY a JSON array of accessibility issues — no markdown, no explanation:
[
  { "issue": string, "severity": "error"|"warning"|"info", "element": string | null, "suggestion": string }
]

Focus on:
1. Color contrast — check inline color/background-color pairs against WCAG AA (≥4.5:1 for normal text, ≥3:1 for large text). Flag only clear violations.
2. Alt text quality — empty or generic alt text on non-decorative images (e.g. alt="image", alt="photo")
3. Heading hierarchy — h1→h2→h3 order, missing or skipped levels
4. Semantic HTML — proper use of headings, lists, paragraphs vs plain divs
5. Any additional WCAG 2.1 AA issues specific to email (no hover effects, no JS-only interactions)

Return an empty array [] if no issues found. Limit to 10 most important issues.`;

async function aiChecks(html: string, apiKey: string): Promise<AccessibilityIssue[]> {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .slice(0, 20_000);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: `Check this HTML email:\n\n${stripped}` }],
    }),
  });

  if (!response.ok) {
    // AI check failure is non-fatal — we return rule-based results only
    return [];
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 10).map((item: Record<string, unknown>) => ({
      issue: String(item.issue ?? ''),
      severity: (['error', 'warning', 'info'].includes(item.severity as string)
        ? item.severity
        : 'warning') as IssueSeverity,
      element: item.element ? String(item.element) : undefined,
      suggestion: String(item.suggestion ?? ''),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a full accessibility check on an HTML email.
 *
 * @param html   Full HTML email body
 * @param apiKey Anthropic API key (if empty, only rule-based checks run)
 */
export async function checkAccessibility(
  html: string,
  apiKey: string | undefined,
): Promise<AccessibilityReport> {
  const cacheKey = `editor:a11y:${crypto.createHash('sha256').update(html).digest('hex')}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as AccessibilityReport;

  const { issues: ruleIssues, totalChecks } = ruleBasedChecks(html);

  let aiIssues: AccessibilityIssue[] = [];
  if (apiKey) {
    aiIssues = await aiChecks(html, apiKey);
  }

  const allIssues = [...ruleIssues, ...aiIssues];

  // Score: errors cost 3 pts, warnings 1 pt, info 0 pts — capped at 0
  const totalPoints = totalChecks + aiIssues.length; // AI adds virtual checks
  const deductions = allIssues.reduce(
    (s, i) => s + (i.severity === 'error' ? 3 : i.severity === 'warning' ? 1 : 0),
    0,
  );
  const score = Math.max(0, Math.round(((totalPoints - deductions) / Math.max(totalPoints, 1)) * 100));

  const report: AccessibilityReport = { issues: allIssues, score };

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(report));

  return report;
}
