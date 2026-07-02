/**
 * Brand-kit-from-URL scraper (Constant Contact parity: "scan your website").
 *
 * Deterministically extracts a brand kit — logo, colour palette, fonts, theme
 * colour, site name — from a public web page. No AI/LLM needed: logos live in
 * og:image / icon links / <img class=logo>, colours in inline styles + <style>
 * + meta theme-color, fonts in font-family declarations + Google Fonts links.
 *
 * `extractBrandFromHtml` is pure (HTML string in, kit out) so it is unit-tested
 * without network; `scrapeBrandFromUrl` adds the fetch.
 */

import { AppError } from '../../lib/app-error.js';

export interface BrandKit {
  siteName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  themeColor: string | null;
  /** Distinct brand colours as #rrggbb, most-frequent first (greys/black/white filtered). */
  colors: string[];
  /** Named font families (generics filtered), most-referenced first. */
  fonts: string[];
  sourceUrl: string;
}

const GENERIC_FONTS = new Set([
  'inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'cursive',
  'fantasy', 'system-ui', '-apple-system', 'blinkmacsystemfont', 'ui-sans-serif',
  'ui-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong',
]);

/** Resolve a possibly-relative href against a base URL; null if unusable. */
function absoluteUrl(href: string | undefined | null, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeHex(raw: string): string | null {
  let h = raw.trim().toLowerCase();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return `#${h}`;
}

/** True for near-white, near-black or near-grey colours (not brand colours). */
function isDullColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max >= 245 && min >= 245) return true; // near white
  if (max <= 16) return true; // near black
  if (max - min <= 16) return true; // near grey (low saturation)
  return false;
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((v) => v < 0 || v > 255)) return null;
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Pure extraction of a brand kit from raw HTML.
 */
export function extractBrandFromHtml(html: string, baseUrl: string): BrandKit {
  const firstMatch = (re: RegExp): string | undefined => re.exec(html)?.[1];

  // ── site name ──────────────────────────────────────────────────────────
  const siteName =
    firstMatch(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(/<title[^>]*>([^<]+)<\/title>/i) ??
    null;

  // ── theme color ────────────────────────────────────────────────────────
  const themeRaw =
    firstMatch(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  const themeColor = themeRaw ? normalizeHex(themeRaw) : null;

  // ── logo ───────────────────────────────────────────────────────────────
  const ogImage =
    firstMatch(/<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

  let imgLogo: string | undefined;
  const imgTag = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgTag.exec(html))) {
    const tag = m[0];
    if (/(?:class|id|alt|src)=["'][^"']*logo[^"']*["']/i.test(tag)) {
      imgLogo = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
      if (imgLogo) break;
    }
  }

  const iconHref =
    firstMatch(
      /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
    ) ?? firstMatch(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);

  const logoUrl =
    absoluteUrl(imgLogo, baseUrl) ??
    absoluteUrl(ogImage, baseUrl) ??
    absoluteUrl(iconHref, baseUrl);

  // Favicon: prefer an exact rel="icon"/"shortcut icon" link over apple-touch-icon.
  const faviconHref =
    firstMatch(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ??
    firstMatch(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  const faviconUrl =
    absoluteUrl(faviconHref, baseUrl) ?? absoluteUrl('/favicon.ico', baseUrl);

  // ── colours (frequency-ranked) ───────────────────────────────────────────
  const counts = new Map<string, number>();
  const bump = (hex: string | null) => {
    if (!hex || isDullColor(hex)) return;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  let hexM: RegExpExecArray | null;
  const hexRe = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  while ((hexM = hexRe.exec(html))) bump(normalizeHex(hexM[0]));
  let rgbM: RegExpExecArray | null;
  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;
  while ((rgbM = rgbRe.exec(html))) {
    bump(normalizeHex(rgbToHex(+rgbM[1]!, +rgbM[2]!, +rgbM[3]!) ?? '') ?? null);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  // Put the theme colour first if present and not dull.
  const colors: string[] = [];
  if (themeColor && !isDullColor(themeColor)) colors.push(themeColor);
  for (const c of ranked) {
    if (colors.length >= 6) break;
    if (!colors.includes(c)) colors.push(c);
  }

  // ── fonts ──────────────────────────────────────────────────────────────
  const fontCounts = new Map<string, number>();
  const addFont = (name: string) => {
    const clean = name.replace(/["']/g, '').trim();
    if (!clean) return;
    if (GENERIC_FONTS.has(clean.toLowerCase())) return;
    // Preserve first-seen casing but dedupe case-insensitively.
    const existing = [...fontCounts.keys()].find((k) => k.toLowerCase() === clean.toLowerCase());
    const key = existing ?? clean;
    fontCounts.set(key, (fontCounts.get(key) ?? 0) + 1);
  };
  let ffM: RegExpExecArray | null;
  const ffRe = /font-family\s*:\s*([^;"'}<]+)/gi;
  while ((ffM = ffRe.exec(html))) {
    const first = ffM[1]!.split(',')[0]!;
    addFont(first);
  }
  // Google Fonts <link href="...css?family=Roboto:400|Open+Sans">
  let gfM: RegExpExecArray | null;
  const gfRe = /fonts\.googleapis\.com\/css2?\?([^"']+)/gi;
  while ((gfM = gfRe.exec(html))) {
    const params = gfM[1]!;
    const families = params.match(/family=([^&]+)/gi) ?? [];
    for (const fam of families) {
      const raw = decodeURIComponent(fam.replace(/^family=/i, ''));
      // "Open+Sans:wght@400;700" | "Roboto|Lato"
      for (const part of raw.split('|')) {
        const name = part.split(':')[0]!.replace(/\+/g, ' ');
        addFont(name);
      }
    }
  }
  const fonts = [...fontCounts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 5);

  return { siteName, logoUrl, faviconUrl, themeColor, colors, fonts, sourceUrl: baseUrl };
}

/**
 * Fetch a URL and extract its brand kit.
 */
export async function scrapeBrandFromUrl(url: string): Promise<BrandKit> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw AppError.badRequest('Invalid URL');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw AppError.badRequest('URL must be http(s)');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let html: string;
  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ForgeMsg/1.0; +https://forgemsg.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw AppError.badRequest(`URL returned HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw AppError.badRequest('URL timed out after 10 seconds');
    }
    if (err instanceof AppError) throw err;
    throw AppError.badRequest('Could not fetch URL');
  } finally {
    clearTimeout(timeout);
  }

  // Cap size but KEEP <style> blocks (they hold brand colours + fonts).
  return extractBrandFromHtml(html.slice(0, 400_000), target.toString());
}
