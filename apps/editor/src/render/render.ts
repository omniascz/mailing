import type {
  Block,
  ButtonBlock,
  ColumnsBlock,
  DividerBlock,
  DynamicBlock,
  EmailSchema,
  FooterBlock,
  HeroBlock,
  ImageBlock,
  ProductBlock,
  VideoBlock,
  CouponBlock,
  SocialBlock,
  SpacerBlock,
  TextBlock,
} from '../schema/blocks.js';
import { parseMergeTags, type MergeTagContext } from './merge-tags.js';
import { evaluateCondition } from './evaluate-condition.js';

/**
 * JSON → responsive HTML email renderer.
 *
 * Design goals:
 * - Table-based layout (Outlook survival)
 * - Inline styles (no external CSS files to fetch)
 * - Max-width container (default 600px)
 * - Media-query fallback that stacks columns on mobile
 * - Dark-mode meta tag (`color-scheme`) — clients decide what to do with it
 * - Hidden preheader span trick for inbox preview text
 * - Merge tag resolution on every text field at render time
 *
 * The render is pure + synchronous: no network, no file IO. Heavy tasks
 * (image CDN rewriting, link tracking) are added by callers wrapping this
 * output.
 */

export interface UtmConfig {
  /** utm_source — default 'email' */
  source?: string;
  /** utm_medium — default 'newsletter' or the campaign stream */
  medium?: string;
  /** utm_campaign — default campaign slug / id */
  campaign?: string;
  /** utm_content — injected per-block when possible */
  content?: string;
  /** utm_term — optional keyword context */
  term?: string;
}

export interface RenderOptions {
  context?: MergeTagContext;
  /**
   * When true, DynamicBlocks render both branches as sibling content wrapped
   * in a marker comment. Useful for the editor's "show all" preview mode so
   * authors can proofread both variants at once.
   */
  previewAllDynamicBranches?: boolean;
  /**
   * When set, all href attributes in the rendered HTML that start with
   * http/https get UTM query params appended automatically. Params already
   * present in the URL are NOT overwritten.
   */
  utm?: UtmConfig;
  /**
   * Which message stream this render belongs to.
   *
   * Marketing streams ('broadcast', 'triggered') always get an unsubscribe link
   * and the sender's postal address, whether or not the template has a footer
   * block. 'transactional' gets neither: an order confirmation or a password
   * reset is a different legal category, and offering to unsubscribe from one
   * is both wrong and confusing.
   *
   * Defaults to 'broadcast' deliberately. A caller that forgets to say gets the
   * compliant-but-noisy outcome rather than the silent one — 61 of the 81
   * built-in templates have no footer block, and every one of them used to
   * render with no opt-out at all.
   */
  stream?: MessageStream;
  /**
   * Language for the strings the renderer adds itself — today just the
   * unsubscribe label. Falls back to English.
   *
   * Taken from the template's `locale`, the field TemplateMeta gained when the
   * Czech library landed. Organisations have no language column, so there is
   * nothing else to read: a campaign carries a copied schema with no locale and
   * therefore renders the English label until it carries one.
   */
  locale?: RenderLocale;
}

export type MessageStream = 'broadcast' | 'triggered' | 'transactional';
export type RenderLocale = 'en' | 'cs' | 'sk';

/** Unsubscribe label per language. English is the fallback, not a translation gap. */
const UNSUBSCRIBE_LABEL: Record<RenderLocale, string> = {
  en: 'Unsubscribe',
  cs: 'Odhlásit z odběru',
  sk: 'Odhlásiť z odberu',
};

function unsubscribeLabel(locale: RenderLocale | undefined): string {
  return UNSUBSCRIBE_LABEL[locale ?? 'en'] ?? UNSUBSCRIBE_LABEL.en;
}

/** Marketing mail must carry an opt-out. Transactional mail must not offer one. */
export function isMarketingStream(stream: MessageStream | undefined): boolean {
  return (stream ?? 'broadcast') !== 'transactional';
}

export interface RenderResult {
  html: string;
  /** Flat list of unique links found in the rendered HTML (for link checker). */
  links: string[];
}

export function renderEmail(schema: EmailSchema, opts: RenderOptions = {}): RenderResult {
  const ctx = opts.context ?? {};
  const preview = opts.previewAllDynamicBranches === true;
  const marketing = isMarketingStream(opts.stream);
  const locale = opts.locale;
  const links: string[] = [];

  let body = schema.blocks
    .map((b) => renderBlock(b, schema, ctx, preview, links, marketing, locale))
    .join('\n');

  // The compliance footer. Marketing mail leaves here with an opt-out link and
  // the sender's postal address, or it does not leave at all.
  //
  // This used to depend on the template carrying a footer block, and 61 of the
  // 81 built-in templates do not. Those rendered with no unsubscribe link and
  // no address — a legal problem, and on a shared IP pool a deliverability one.
  // Fixing it in the renderer rather than in 61 templates means a new template
  // cannot reintroduce it, and neither can a template that sets
  // showUnsubscribe: false (which is honoured for transactional and ignored
  // for marketing, see renderFooter).
  if (marketing && !body.includes(COMPLIANCE_MARKER)) {
    body += '\n' + complianceFooter(ctx, locale, links);
  }

  // Org-wide custom footer (SendGrid Mail Settings) — appended to every email
  // as a trailing row when configured on the org.
  const footerHtml = ctx.system?.footerHtml?.trim();
  if (footerHtml) {
    body += `\n<tr><td class="fm-footer-text" style="padding:16px 24px;font-size:12px;color:#64748b;">${footerHtml}</td></tr>`;
  }

  const gs = schema.globalStyles;
  const width = gs.contentWidth;
  const escapedSubject = escapeHtml(parseMergeTags(schema.subject, ctx));
  const preheader = escapeHtml(parseMergeTags(schema.preheader, ctx));

  // Using old-school <center> + table-in-table so Outlook stays happy.
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapedSubject}</title>
<style type="text/css">
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
  a { color: ${gs.linkColor}; text-decoration: underline; }
  .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; mso-hide: all; overflow: hidden; }
  @media only screen and (max-width: ${width}px) {
    .fm-container { width: 100% !important; max-width: 100% !important; }
    .fm-col { display: block !important; width: 100% !important; max-width: 100% !important; }
  }
  /* Dark mode overrides (Apple Mail, Samsung Mail, Outlook.com dark mode).
     We use :root[data-ogsc] (Outlook.com) and [data-ogsb] as extra selectors.
     !important is intentional — inline styles must be overridden in dark clients. */
  @media (prefers-color-scheme: dark) {
    body, .fm-body-bg { background-color: #1a1a2e !important; }
    .fm-content-bg { background-color: #16213e !important; }
    .fm-text-default { color: #e2e8f0 !important; }
    .fm-link { color: #93c5fd !important; }
    .fm-divider { border-color: #334155 !important; }
    .fm-footer-text { color: #64748b !important; }
    /* Invert logos marked data-dark-invert */
    img[data-dark-invert] { filter: invert(1) !important; }
  }
  /* Outlook.com dark mode selector */
  [data-ogsc] body, [data-ogsc] .fm-body-bg { background-color: #1a1a2e !important; }
  [data-ogsc] .fm-content-bg { background-color: #16213e !important; }
  [data-ogsc] .fm-text-default { color: #e2e8f0 !important; }
  [data-ogsc] .fm-link { color: #93c5fd !important; }
</style>
</head>
<body class="fm-body-bg" style="margin:0;padding:0;background-color:${gs.backgroundColor};font-family:${gs.fontFamily};color:${gs.textColor};">
<span class="preheader">${preheader}</span>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="fm-body-bg" bgcolor="${gs.backgroundColor}">
  <tr>
    <td align="center" style="padding:24px 8px;">
      <table role="presentation" class="fm-container fm-content-bg" width="${width}" border="0" cellpadding="0" cellspacing="0" style="width:${width}px;max-width:${width}px;background-color:${gs.contentBackgroundColor};">
        ${body}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // UTM auto-append: rewrite href attrs for all http/https links
  const finalHtml = opts.utm ? appendUtmParams(html, opts.utm) : html;

  // Dedup links, preserve order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const l of links) {
    if (!seen.has(l)) {
      seen.add(l);
      deduped.push(l);
    }
  }

  return { html: finalHtml, links: deduped };
}

/**
 * Post-process rendered HTML to append UTM query parameters to every
 * http/https href. Params already present in the URL are NOT overwritten
 * (first-writer wins). Unsubscribe / preference-center links are skipped.
 */
function appendUtmParams(html: string, utm: UtmConfig): string {
  const skipPatterns = ['unsubscribe', 'preference', 'optout', 'opt-out'];

  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (match, url: string) => {
    // Skip functional links
    if (skipPatterns.some((p) => url.toLowerCase().includes(p))) return match;

    try {
      const parsed = new URL(url);
      const set = (key: string, value: string | undefined) => {
        if (value && !parsed.searchParams.has(key)) {
          parsed.searchParams.set(key, value);
        }
      };
      set('utm_source', utm.source ?? 'email');
      set('utm_medium', utm.medium ?? 'newsletter');
      if (utm.campaign) set('utm_campaign', utm.campaign);
      if (utm.content) set('utm_content', utm.content);
      if (utm.term) set('utm_term', utm.term);
      return `href="${parsed.toString()}"`;
    } catch {
      return match; // malformed URL — leave unchanged
    }
  });
}

// ---------------------------------------------------------------------------
// Per-block renderers
// ---------------------------------------------------------------------------

function renderBlock(
  block: Block,
  schema: EmailSchema,
  ctx: MergeTagContext,
  previewAll: boolean,
  links: string[],
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  switch (block.type) {
    case 'text':
      return renderText(block, ctx);
    case 'image':
      return renderImage(block, ctx, links);
    case 'button':
      return renderButton(block, ctx, links);
    case 'divider':
      return renderDivider(block);
    case 'spacer':
      return renderSpacer(block);
    case 'columns':
      return renderColumns(block, schema, ctx, previewAll, links, marketing, locale);
    case 'hero':
      return renderHero(block, schema, ctx, previewAll, links, marketing, locale);
    case 'social':
      return renderSocial(block, ctx, links);
    case 'product':
      return renderProduct(block, ctx, links);
    case 'video':
      return renderVideo(block, ctx, links);
    case 'coupon':
      return renderCoupon(block, ctx, links);
    case 'footer':
      return renderFooter(block, ctx, links, marketing, locale);
    case 'dynamic':
      return renderDynamic(block, schema, ctx, previewAll, links, marketing, locale);
  }
}

function cellPadding(block: Block): string {
  const p = block.styles?.padding ?? '16px 24px';
  return p;
}

function bgAttr(block: Block): string {
  const bg = block.styles?.backgroundColor;
  return bg ? ` bgcolor="${bg}"` : '';
}

// ---------- leaf blocks ----------

function renderText(block: TextBlock, ctx: MergeTagContext): string {
  const content = parseMergeTags(block.content, ctx);
  const style =
    `font-size:${block.fontSize};font-family:${block.fontFamily};color:${block.color};` +
    `line-height:${block.lineHeight};text-align:${block.textAlign};`;
  return `<tr><td${bgAttr(block)} style="padding:${cellPadding(block)};${style}">${content}</td></tr>`;
}

function renderImage(block: ImageBlock, ctx: MergeTagContext, links: string[]): string {
  const src = escapeAttr(parseMergeTags(block.src, ctx));
  const alt = escapeAttr(parseMergeTags(block.alt ?? '', ctx));
  const w = block.width ? ` width="${block.width}"` : '';
  const h = block.height ? ` height="${block.height}"` : '';
  let img = `<img src="${src}" alt="${alt}"${w}${h} style="max-width:100%;height:auto;display:block;border:0;" />`;
  if (block.link) {
    const href = escapeAttr(parseMergeTags(block.link, ctx));
    links.push(href);
    img = `<a href="${href}" target="_blank" rel="noopener">${img}</a>`;
  }
  return `<tr><td${bgAttr(block)} align="${block.align}" style="padding:${cellPadding(block)};">${img}</td></tr>`;
}

function renderButton(block: ButtonBlock, ctx: MergeTagContext, links: string[]): string {
  const href = escapeAttr(parseMergeTags(block.url, ctx));
  const text = escapeHtml(parseMergeTags(block.text, ctx));
  links.push(href);
  const paddingBySize = { sm: '8px 16px', md: '12px 24px', lg: '16px 32px' }[block.size];
  const fontSizeBySize = { sm: '14px', md: '16px', lg: '18px' }[block.size];
  const anchor =
    `<a href="${href}" target="_blank" rel="noopener" ` +
    `style="background-color:${block.backgroundColor};color:${block.textColor};` +
    `border-radius:${block.borderRadius};padding:${paddingBySize};` +
    `font-size:${fontSizeBySize};font-weight:600;text-decoration:none;display:inline-block;">${text}</a>`;
  return `<tr><td${bgAttr(block)} align="${block.align}" style="padding:${cellPadding(block)};">${anchor}</td></tr>`;
}

function renderDivider(block: DividerBlock): string {
  const inner =
    `<table role="presentation" width="${block.widthPercent}%" border="0" cellpadding="0" cellspacing="0">` +
    `<tr><td style="border-top:${block.thickness}px solid ${block.color};font-size:0;line-height:0;">&nbsp;</td></tr>` +
    `</table>`;
  return `<tr><td${bgAttr(block)} align="center" style="padding:${cellPadding(block)};">${inner}</td></tr>`;
}

function renderSpacer(block: SpacerBlock): string {
  return `<tr><td${bgAttr(block)} style="font-size:0;line-height:0;height:${block.height}px;">&nbsp;</td></tr>`;
}

function renderSocial(block: SocialBlock, ctx: MergeTagContext, links: string[]): string {
  const cells = block.networks
    .map((n) => {
      const href = escapeAttr(parseMergeTags(n.url, ctx));
      links.push(href);
      return `<td style="padding:0 6px;"><a href="${href}" target="_blank" rel="noopener">${iconFor(n.type, block.iconSize)}</a></td>`;
    })
    .join('');
  const inner = `<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
  return `<tr><td${bgAttr(block)} align="${block.align}" style="padding:${cellPadding(block)};">${inner}</td></tr>`;
}

function iconFor(type: SocialBlock['networks'][number]['type'], size: number): string {
  const label = {
    facebook: 'Facebook',
    twitter: 'X',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
  }[type];
  return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;border-radius:${Math.floor(
    size / 2,
  )}px;background:#111827;color:#ffffff;font-size:${Math.max(10, Math.floor(size / 3))}px;font-weight:600;">${label.charAt(0)}</span>`;
}

function renderProduct(block: ProductBlock, ctx: MergeTagContext, links: string[]): string {
  const title = escapeHtml(parseMergeTags(block.title, ctx));
  const imgSrc = escapeAttr(parseMergeTags(block.imageSrc, ctx));
  const price = escapeHtml(parseMergeTags(block.price, ctx));
  const compareRaw = parseMergeTags(block.compareAtPrice ?? '', ctx).trim();
  const compare = compareRaw ? escapeHtml(compareRaw) : '';
  const desc = escapeHtml(parseMergeTags(block.description ?? '', ctx));
  const href = escapeAttr(parseMergeTags(block.productUrl, ctx));
  const ctaText = escapeHtml(parseMergeTags(block.ctaText, ctx));
  links.push(href);

  const imgMargin =
    block.align === 'center' ? '0 auto' : block.align === 'right' ? '0 0 0 auto' : '0';
  const img =
    `<a href="${href}" target="_blank" rel="noopener">` +
    `<img src="${imgSrc}" alt="${escapeAttr(title)}" style="max-width:100%;height:auto;display:block;border:0;border-radius:6px;margin:${imgMargin};" /></a>`;

  const titleHtml =
    `<a href="${href}" target="_blank" rel="noopener" ` +
    `style="font-size:16px;font-weight:700;color:${block.titleColor};text-decoration:none;">${title}</a>`;
  const priceHtml =
    `<div style="font-size:18px;font-weight:700;color:${block.priceColor};margin:4px 0;">` +
    (compare
      ? `<span style="text-decoration:line-through;color:#9ca3af;font-weight:400;margin-right:6px;">${compare}</span>`
      : '') +
    `${price}</div>`;
  const descHtml = desc
    ? `<div style="font-size:14px;color:#4b5563;line-height:1.5;margin:4px 0;">${desc}</div>`
    : '';
  const cta =
    `<a href="${href}" target="_blank" rel="noopener" ` +
    `style="background-color:${block.ctaBackgroundColor};color:${block.ctaTextColor};border-radius:6px;` +
    `padding:10px 20px;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;margin-top:8px;">${ctaText}</a>`;

  const textCol =
    `<div style="font-family:${block.fontFamily};text-align:${block.align};">` +
    `${titleHtml}${priceHtml}${descHtml}${cta}</div>`;

  let inner: string;
  if (block.imagePosition === 'top') {
    inner = `<div style="text-align:${block.align};">${img}</div>${textCol}`;
  } else {
    const imgCell = `<td valign="top" width="50%" style="width:50%;padding:0 12px 0 0;">${img}</td>`;
    const txtCell = `<td valign="top" width="50%" style="width:50%;">${textCol}</td>`;
    const cells = block.imagePosition === 'left' ? imgCell + txtCell : txtCell + imgCell;
    inner = `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
  }

  return `<tr><td${bgAttr(block)} align="${block.align}" style="padding:${cellPadding(block)};">${inner}</td></tr>`;
}

function renderVideo(block: VideoBlock, ctx: MergeTagContext, links: string[]): string {
  const src = escapeAttr(parseMergeTags(block.thumbnailSrc, ctx));
  const href = escapeAttr(parseMergeTags(block.videoUrl, ctx));
  const alt = escapeAttr(parseMergeTags(block.alt ?? '', ctx));
  links.push(href);
  const w = block.width ? ` width="${block.width}"` : '';
  const playSize = 64;
  const triangle =
    `<span style="display:inline-block;vertical-align:middle;width:0;height:0;` +
    `border-style:solid;border-width:13px 0 13px 22px;` +
    `border-color:transparent transparent transparent ${block.playButtonColor};margin-left:6px;"></span>`;
  const playBtn =
    `<span style="display:inline-block;width:${playSize}px;height:${playSize}px;line-height:${playSize}px;` +
    `border-radius:50%;background:${block.overlayColor};text-align:center;">${triangle}</span>`;
  // position:relative/absolute overlay degrades gracefully (stacks) where stripped.
  const inner =
    `<a href="${href}" target="_blank" rel="noopener" style="position:relative;display:inline-block;text-decoration:none;">` +
    `<img src="${src}" alt="${alt}"${w} style="max-width:100%;height:auto;display:block;border:0;" />` +
    `<span style="position:absolute;top:50%;left:50%;margin-top:-${playSize / 2}px;margin-left:-${playSize / 2}px;">${playBtn}</span>` +
    `</a>`;
  return `<tr><td${bgAttr(block)} align="${block.align}" style="padding:${cellPadding(block)};">${inner}</td></tr>`;
}

function renderCoupon(block: CouponBlock, ctx: MergeTagContext, links: string[]): string {
  // Note: {{coupon_code:batchId}} is intentionally left untouched by
  // parseMergeTags (colon grammar) and resolved per-recipient at send time.
  const code = escapeHtml(parseMergeTags(block.code, ctx));
  const headline = escapeHtml(parseMergeTags(block.headline ?? '', ctx));
  const description = escapeHtml(parseMergeTags(block.description ?? '', ctx));
  const expiry = escapeHtml(parseMergeTags(block.expiryText ?? '', ctx));
  const ctaTextRaw = parseMergeTags(block.ctaText ?? '', ctx).trim();
  const ctaUrlRaw = parseMergeTags(block.ctaUrl ?? '', ctx).trim();

  const headlineHtml = headline
    ? `<div style="font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${headline}</div>`
    : '';
  const codeHtml =
    `<div style="display:inline-block;font-size:24px;font-weight:800;letter-spacing:0.08em;` +
    `padding:12px 24px;background:${block.codeBackgroundColor};color:${block.codeTextColor};` +
    `border:2px ${block.borderStyle} ${block.borderColor};border-radius:8px;">${code}</div>`;
  const descHtml = description
    ? `<div style="font-size:14px;color:#4b5563;line-height:1.5;margin-top:10px;">${description}</div>`
    : '';
  const expiryHtml = expiry
    ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px;">${expiry}</div>`
    : '';
  let ctaHtml = '';
  if (ctaTextRaw && ctaUrlRaw) {
    const href = escapeAttr(ctaUrlRaw);
    links.push(href);
    ctaHtml =
      `<div style="margin-top:12px;"><a href="${href}" target="_blank" rel="noopener" ` +
      `style="background-color:${block.ctaBackgroundColor};color:${block.ctaTextColor};border-radius:6px;` +
      `padding:10px 20px;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${escapeHtml(ctaTextRaw)}</a></div>`;
  }

  const inner =
    `<div style="font-family:${block.fontFamily};text-align:${block.align};">` +
    `${headlineHtml}${codeHtml}${descHtml}${expiryHtml}${ctaHtml}</div>`;
  return `<tr><td${bgAttr(block)} align="${block.align}" style="padding:${cellPadding(block)};">${inner}</td></tr>`;
}

/**
 * Marks a rendered row as carrying the opt-out, so renderEmail knows whether the
 * template already produced one and does not append a second.
 */
const COMPLIANCE_MARKER = 'data-fm-optout="1"';

/** Sender identity block — the postal address CAN-SPAM and GDPR both want. */
function postalAddress(ctx: MergeTagContext): string {
  const address = ctx.system?.companyAddress?.trim();
  if (!address) return '';
  const name = ctx.system?.companyName?.trim();
  const lines = [name, address]
    .filter(Boolean)
    .map((l) => escapeHtml(l!))
    .join('<br/>');
  return `<div style="margin-top:8px;">${lines}</div>`;
}

function optOutLink(
  ctx: MergeTagContext,
  locale: RenderLocale | undefined,
  colour: string,
  links: string[],
): string {
  const url = ctx.system?.unsubscribeUrl ?? '{{unsubscribe_url}}';
  links.push(url);
  return `<div style="margin-top:8px;"><a href="${escapeAttr(url)}" style="color:${colour};text-decoration:underline;">${escapeHtml(unsubscribeLabel(locale))}</a></div>`;
}

/**
 * The row appended to marketing mail whose template did not produce one.
 *
 * Deliberately plain: it exists so the message is lawful to send, not to look
 * designed. A template that wants a designed footer gets one by carrying a
 * footer block, and then this does not fire.
 */
function complianceFooter(
  ctx: MergeTagContext,
  locale: RenderLocale | undefined,
  links: string[],
): string {
  const colour = '#6b7280';
  return (
    `<tr><td ${COMPLIANCE_MARKER} class="fm-footer-text" style="padding:16px 24px;font-size:12px;color:${colour};text-align:center;">` +
    `${postalAddress(ctx)}${optOutLink(ctx, locale, colour, links)}` +
    `</td></tr>`
  );
}

function renderFooter(
  block: FooterBlock,
  ctx: MergeTagContext,
  links: string[],
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  const body = escapeHtml(parseMergeTags(block.content, ctx));

  // CAN-SPAM: always append the sender's physical postal address when the org
  // has one configured (and the footer body doesn't already contain it).
  const address = ctx.system?.companyAddress?.trim();
  const addr = address && !block.content.includes(address) ? postalAddress(ctx) : '';

  // showUnsubscribe is the template's opinion. It is honoured for
  // transactional mail, where an opt-out does not belong, and overridden for
  // marketing, where a template must not be able to switch off the one thing
  // the law requires.
  const showOptOut = marketing || block.showUnsubscribe;
  const unsub = showOptOut ? optOutLink(ctx, locale, block.color, links) : '';
  const marker = showOptOut ? ` ${COMPLIANCE_MARKER}` : '';

  const style = `font-size:${block.fontSize};color:${block.color};text-align:${block.textAlign};`;
  return `<tr><td${bgAttr(block)}${marker} style="padding:${cellPadding(block)};${style}">${body}${addr}${unsub}</td></tr>`;
}

// ---------- container blocks ----------

function renderColumns(
  block: ColumnsBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  previewAll: boolean,
  links: string[],
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  const totalRatio = block.columnRatios.reduce((a, b) => a + b, 0) || 1;
  const width = schema.globalStyles.contentWidth;
  const gap = block.gap ?? '0';

  const cells = block.columns
    .map((colBlocks, i) => {
      const ratio = block.columnRatios[i] ?? 1;
      const colWidth = Math.floor((ratio / totalRatio) * width);
      const inner = colBlocks
        .map((b) => renderBlock(b, schema, ctx, previewAll, links, marketing, locale))
        .join('');
      // Each column is its own table so the sub-blocks (which are <tr>s) have
      // a parent <table> wrapper. On mobile the <td class="fm-col"> becomes a
      // block so columns stack naturally.
      return (
        `<td class="fm-col" valign="top" width="${colWidth}" ` +
        `style="width:${colWidth}px;vertical-align:top;${gap ? `padding:0 ${gap};` : ''}">` +
        `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${inner}</table>` +
        `</td>`
      );
    })
    .join('');

  return `<tr><td${bgAttr(block)} style="padding:${cellPadding(block)};"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></td></tr>`;
}

function renderHero(
  block: HeroBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  previewAll: boolean,
  links: string[],
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  const bg = block.backgroundColor ?? '#111827';
  const bgImage = block.backgroundImage
    ? `background-image:url('${escapeAttr(block.backgroundImage)}');background-size:cover;background-position:center;`
    : '';
  const minH = block.minHeight ?? '240px';
  const inner = block.content
    .map((b) => renderBlock(b, schema, ctx, previewAll, links, marketing, locale))
    .join('');
  return `<tr><td bgcolor="${bg}" style="background-color:${bg};${bgImage}min-height:${minH};padding:${cellPadding(block)};"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${inner}</table></td></tr>`;
}

function renderDynamic(
  block: DynamicBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  previewAll: boolean,
  links: string[],
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  if (previewAll) {
    const ifHtml = block.ifContent
      .map((b) => renderBlock(b, schema, ctx, previewAll, links, marketing, locale))
      .join('');
    const elseHtml = block.elseContent
      .map((b) => renderBlock(b, schema, ctx, previewAll, links, marketing, locale))
      .join('');
    const label = escapeHtml(block.label ?? 'Dynamic block');
    return (
      `<tr><td style="padding:0;"><!-- dynamic:${block.id} if -->` +
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border:2px dashed #22c55e;">` +
      `<tr><td style="background:#dcfce7;padding:4px 12px;font-size:11px;color:#166534;">${label} — IF branch</td></tr>${ifHtml}</table></td></tr>` +
      `<tr><td style="padding:0;"><!-- dynamic:${block.id} else -->` +
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border:2px dashed #f97316;">` +
      `<tr><td style="background:#ffedd5;padding:4px 12px;font-size:11px;color:#9a3412;">${label} — ELSE branch</td></tr>${elseHtml}</table></td></tr>`
    );
  }

  const branch = evaluateCondition(block.condition, ctx.contact ?? undefined)
    ? block.ifContent
    : block.elseContent;
  return branch
    .map((b) => renderBlock(b, schema, ctx, previewAll, links, marketing, locale))
    .join('');
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
