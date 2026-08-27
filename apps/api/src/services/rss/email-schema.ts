/**
 * A feed, expressed as the block schema every other campaign is stored in.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * `processOne` used to store the parsed feed as-is:
 *
 *     content: { items, sourceFeed, generatedFrom: 'rss' }
 *
 * That is a fourth shape of `campaigns.content`, and readCampaignContent
 * reports it as 'unknown' — correctly, because it is neither a block schema nor
 * raw HTML. The send path then falls to its last branch and puts
 * `JSON.stringify(content)` in the body. Measured on master before this file
 * existed: the MTA job's htmlBody and textBody were both the literal JSON of
 * the feed, with a tracking pixel appended.
 *
 * The only reason a subscriber never received that JSON is assertOptOutPresent,
 * which refuses marketing mail with no opt-out — and a feed decides whether it
 * trips: an item containing the text `{{unsubscribe_url}}`, or quoting the
 * org's unsubscribe URL, satisfies the guard and the JSON goes out.
 *
 * So the fix is not another branch in the send path. It is to stop creating the
 * fourth shape: build the schema here, at the one place a feed becomes a
 * campaign, and the send path sees an ordinary block campaign. The compliance
 * footer, the sanitiser, the UTM rewriter and the plain-text alternative are
 * then not things this file has to remember — they are what Path 1 does.
 *
 * ─── Why existing blocks and no `rss-items` block ────────────────────────────
 *
 * A new block type is a branch in renderEmail, another in renderPlainText, an
 * entry in BLOCK_TYPES, a palette item in the editor and a case in every
 * coverage test — for a layout that `text` and `divider` already express.
 *
 * There is a second reason, and it is the load-bearing one: a feed is
 * untrusted input, and the two blocks differ in what protects them.
 *
 *   - `text.content` is sanitised at render time (render.ts calls
 *     sanitizeUserHtml on it), and sanitize.ts allows href schemes
 *     http/https/mailto/tel only. `javascript:` cannot survive.
 *   - `button.url` is not. renderButton does `escapeAttr(...)` and nothing
 *     else, so `javascript:alert(1)` from a feed would land in an href — on
 *     the view-in-browser page that is script in our own origin. And
 *     `buttonBlockSchema.url` would not stop it either: `z.string().url()`
 *     accepts `javascript:alert(1)`, because it is a well-formed URL.
 *
 * There is a third: `button.url` is REQUIRED and must parse. A single feed item
 * with an empty or relative `<link>` would fail emailSchema.safeParse, which
 * makes readCampaignContent return schema: null — and the send path falls back
 * to exactly the raw branch this change exists to get off. One malformed item
 * must not put the whole campaign back on the JSON path.
 *
 * So every piece of feed text goes inside `text.content`, where the sanitiser
 * reaches it, and the link is an ordinary `<a>` in that HTML rather than block
 * structure. Escaping here is the first layer, not the only one.
 */

import type { RssItem } from './index.js';

/** Just enough of EmailSchema to satisfy readCampaignContent's 'blocks' branch. */
export interface RssEmailSchema {
  subject: string;
  preheader: string;
  globalStyles: {
    backgroundColor: string;
    contentBackgroundColor: string;
    fontFamily: string;
    linkColor: string;
    textColor: string;
    contentWidth: number;
  };
  blocks: Array<Record<string, unknown>>;
}

const FONT = 'Arial, Helvetica, sans-serif';

const GLOBAL_STYLES: RssEmailSchema['globalStyles'] = {
  backgroundColor: '#f3f4f6',
  contentBackgroundColor: '#ffffff',
  fontFamily: FONT,
  linkColor: '#2563eb',
  textColor: '#111827',
  contentWidth: 600,
};

/**
 * HTML-escape feed text.
 *
 * The sanitiser downstream would also neutralise a tag, but it is the wrong
 * place to rely on for this: it is an allowlist, so a tag it happens to allow
 * (`<b>`, `<a>`) would survive from the feed as MARKUP rather than as the text
 * the feed author wrote. Escaping here means feed text renders as text; the
 * sanitiser stays what it is, the backstop for everything else.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The item's link, if it is one we are willing to put in an href.
 *
 * http/https only. Not a duplicate of the sanitiser's allowlist so much as the
 * earlier half of it: this decides whether the anchor is written at all, so a
 * `javascript:` item renders as a plain heading rather than as an anchor the
 * sanitiser later strips the href off (which leaves a link that goes nowhere).
 */
export function safeLink(link: string | undefined): string | null {
  if (!link) return null;
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
}

/** `2026-08-25` — no locale formatting, no dependency on the recipient. */
function isoDate(value: Date | string | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function itemHtml(item: RssItem): string {
  const href = safeLink(item.link);
  const title = escapeHtml(item.title || '(bez názvu)');
  const heading = href
    ? `<h2 style="font-size:20px;margin:0 0 4px;"><a href="${escapeHtml(href)}">${title}</a></h2>`
    : `<h2 style="font-size:20px;margin:0 0 4px;">${title}</h2>`;

  const date = isoDate(item.pubDate);
  const dateLine = date
    ? `<p style="font-size:13px;color:#6b7280;margin:0 0 8px;">${escapeHtml(date)}</p>`
    : '';

  const description = item.description?.trim()
    ? `<p style="margin:0 0 8px;">${escapeHtml(item.description.trim())}</p>`
    : '';

  // The "read on" link repeats the heading's href on purpose: a heading link is
  // easy to miss in a mail client that restyles headings.
  const readMore = href
    ? `<p style="margin:0;"><a href="${escapeHtml(href)}">Číst dál →</a></p>`
    : '';

  return heading + dateLine + description + readMore;
}

/**
 * Build the campaign body for a feed run.
 *
 * `subject` is the campaign's own subject; emailSchema requires one and
 * readCampaignContent parses the whole object, so a schema without it would not
 * parse and the send path would fall back to the raw branch.
 */
export function buildRssEmailSchema(subject: string, items: RssItem[]): RssEmailSchema {
  const blocks: Array<Record<string, unknown>> = [];

  items.forEach((item, index) => {
    blocks.push({
      id: `rss-item-${index}`,
      type: 'text',
      content: itemHtml(item),
      fontSize: '15px',
      fontFamily: FONT,
      color: '#374151',
      lineHeight: '1.6',
      textAlign: 'left',
    });
    if (index < items.length - 1) {
      blocks.push({
        id: `rss-divider-${index}`,
        type: 'divider',
        color: '#e5e7eb',
        thickness: 1,
        widthPercent: 100,
      });
    }
  });

  return {
    subject,
    preheader: '',
    globalStyles: GLOBAL_STYLES,
    blocks,
  };
}

/**
 * Exactly the object `processOne` writes into `campaigns.content`.
 *
 * A separate function from buildRssEmailSchema so a test can assert on the
 * stored object rather than on a reconstruction of it: what goes in the column
 * is what decides which branch of readCampaignContent the send path takes, and
 * a test that rebuilds it by hand would keep passing if the caller stopped
 * matching.
 *
 * `sourceFeed` and `generatedFrom` are provenance. emailSchema strips unknown
 * keys when readCampaignContent parses, so they never reach the renderer; the
 * `blocks` array is what makes this the 'blocks' shape.
 */
export function buildRssCampaignContent(
  subject: string,
  items: RssItem[],
  feedUrl: string,
): Record<string, unknown> {
  return {
    ...buildRssEmailSchema(subject, items),
    sourceFeed: feedUrl,
    generatedFrom: 'rss',
  };
}
