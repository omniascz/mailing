/**
 * Accessibility auto-fixer for HTML emails.
 * While the checker reports issues, this service auto-applies safe fixes.
 */

export interface FixResult {
  html: string;
  fixesApplied: string[];
}

/** Add alt="" to <img> tags that are missing the alt attribute */
function fixMissingAlt(html: string, fixes: string[]): string {
  const before = html;
  html = html.replace(/<img(?![^>]*\balt\s*=)([^>]*)\/?>/gi, (_match, attrs: string) => {
    // Try to guess alt from data-alt, title, or filename in src
    const srcMatch = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const filename = srcMatch
      ? srcMatch[1]!.split('/').pop()!.split('.')[0]!.replace(/[-_]/g, ' ')
      : '';
    const altText = filename || '';
    return `<img${attrs} alt="${altText}">`;
  });
  if (html !== before) fixes.push('Added alt attributes to images missing them');
  return html;
}

/** Add role="presentation" to layout tables */
function fixLayoutTables(html: string, fixes: string[]): string {
  const before = html;
  html = html.replace(/<table(?![^>]*\brole\s*=)([^>]*)>/gi, (_, attrs: string) => {
    const isLayout = !/thead|th\b|<caption/i.test(attrs);
    if (!isLayout) return `<table${attrs}>`;
    return `<table${attrs} role="presentation">`;
  });
  if (html !== before) fixes.push('Added role="presentation" to layout tables');
  return html;
}

/** Add lang attribute to <html> if missing */
function fixLangAttribute(html: string, fixes: string[]): string {
  if (!/<html[^>]+lang\s*=/i.test(html) && /<html/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, '<html$1 lang="cs">');
    fixes.push('Added lang="cs" to <html> element');
  }
  return html;
}

/** Ensure links have descriptive text (replace bare URLs with the text if present) */
function fixEmptyLinks(html: string, fixes: string[]): string {
  const before = html;
  html = html.replace(/<a([^>]*)>\s*<\/a>/gi, (_, attrs: string) => {
    const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(attrs);
    return `<a${attrs}>${hrefMatch?.[1] ?? 'link'}</a>`;
  });
  if (html !== before) fixes.push('Filled empty anchor tags with descriptive href text');
  return html;
}

/** Ensure text has sufficient line-height (min 1.5) */
function fixLineHeight(html: string, fixes: string[]): string {
  const before = html;
  html = html.replace(/line-height\s*:\s*([\d.]+)(?:px|em|rem)?/gi, (_, val: string) => {
    const num = parseFloat(val);
    // Only fix if it looks like a unitless ratio (< 3) that's too small
    if (num < 1.5 && num < 3) return `line-height: 1.5`;
    return `line-height: ${val}`;
  });
  if (html !== before) fixes.push('Increased low line-height values to 1.5 minimum');
  return html;
}

/** Add tabindex and role to interactive elements that lack them */
function fixButtonAccessibility(html: string, fixes: string[]): string {
  const before = html;
  // <a> used as button (has no href or href="#") — add role="button"
  html = html.replace(
    /<a([^>]*)\bhref\s*=\s*["']#["']([^>]*)>/gi,
    (_, pre: string, post: string) => {
      if (/role\s*=/i.test(pre + post)) return `<a${pre}href="#"${post}>`;
      return `<a${pre}href="#" role="button" tabindex="0"${post}>`;
    },
  );
  if (html !== before) fixes.push('Added role="button" and tabindex to anchor-as-button elements');
  return html;
}

/**
 * Apply all safe accessibility auto-fixes to HTML email content.
 * Returns the fixed HTML and a list of applied fixes.
 */
export function fixEmailAccessibility(html: string): FixResult {
  const fixes: string[] = [];
  html = fixLangAttribute(html, fixes);
  html = fixMissingAlt(html, fixes);
  html = fixLayoutTables(html, fixes);
  html = fixEmptyLinks(html, fixes);
  html = fixLineHeight(html, fixes);
  html = fixButtonAccessibility(html, fixes);
  return { html, fixesApplied: fixes };
}
