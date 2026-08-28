/**
 * JSON → plain-text email renderer.
 *
 * Generates a multipart/alternative text body for an EmailSchema.
 * Gmail/Yahoo bulk-sender requirements (2024+) and historical RFC 5322
 * best practice both ask for a text/plain alternative. Many spam filters
 * downgrade messages that ship as text/html only.
 *
 * Design:
 * - Same merge-tag resolution as the HTML renderer (parseMergeTags).
 * - DynamicBlock branches are resolved the same way as renderEmail —
 *   we evaluate the condition with the recipient context and emit only
 *   the chosen branch (no preview mode).
 * - Links are surfaced after their anchor text → "Click here (https://…)".
 * - Block separators: single blank line between blocks, "---" for dividers.
 * - No HTML escaping needed — output is text/plain.
 */

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
  CodeBlock,
  ShareBlock,
  PollBlock,
  SpacerBlock,
  TextBlock,
} from '../schema/blocks.js';
import type { MergeTagContext } from './merge-tags.js';
import { parseMergeTags } from './merge-tags.js';
import { evaluateCondition } from './evaluate-condition.js';
import { sanitizeUserText } from './sanitize.js';
import { shareTargets } from './share.js';
import {
  isMarketingStream,
  mustShowOptOut,
  optOutUrl,
  postalAddressLines,
  unsubscribeLabel,
  type MessageStream,
  type RenderLocale,
} from './compliance.js';

/** Marks the chunk that already carries the opt-out, so none is appended twice. */
const OPT_OUT_MARK = '<<fm-optout>>';

export interface RenderPlainTextOptions {
  context?: MergeTagContext;
  /**
   * Same meaning as on renderEmail, and the same default.
   *
   * This half of a multipart message used to have no opinion at all: the HTML
   * body got a compliance footer and the text alternative went out with no
   * opt-out and no address. A recipient reading the text part — or a filter
   * scoring it — saw a marketing email with no way out.
   */
  stream?: MessageStream;
  /** Language of the strings this renderer adds itself. Falls back to English. */
  locale?: RenderLocale;
}

export function renderPlainText(schema: EmailSchema, opts: RenderPlainTextOptions = {}): string {
  const ctx = opts.context ?? {};
  const marketing = isMarketingStream(opts.stream);
  const locale = opts.locale;
  const parts: string[] = [];

  const subject = parseMergeTags(schema.subject, ctx).trim();
  if (subject) parts.push(subject);

  const preheader = parseMergeTags(schema.preheader, ctx).trim();
  if (preheader) parts.push(preheader);

  for (const block of schema.blocks) {
    const chunk = renderBlock(block, schema, ctx, marketing, locale).trim();
    if (chunk) parts.push(chunk);
  }

  // Same rule as the HTML side, taken from the same place: marketing mail
  // leaves with an opt-out and an address whether or not the template has a
  // footer block. 61 of the 81 built-in templates have none.
  if (marketing && !parts.some((part) => part.includes(OPT_OUT_MARK))) {
    parts.push(complianceFooter(ctx, locale));
  }

  return parts.join('\n\n').split(OPT_OUT_MARK).join('');
}

/** The trailing block appended to marketing mail whose template produced none. */
function complianceFooter(ctx: MergeTagContext, locale: RenderLocale | undefined): string {
  return [...postalAddressLines(ctx), `${unsubscribeLabel(locale)}: ${optOutUrl(ctx)}`].join('\n');
}

function renderBlock(
  block: Block,
  schema: EmailSchema,
  ctx: MergeTagContext,
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  switch (block.type) {
    case 'text':
      return renderText(block, ctx);
    case 'image':
      return renderImage(block, ctx);
    case 'button':
      return renderButton(block, ctx);
    case 'divider':
      return renderDivider(block);
    case 'spacer':
      return renderSpacer(block);
    case 'columns':
      return renderColumns(block, schema, ctx, marketing, locale);
    case 'hero':
      return renderHero(block, schema, ctx, marketing, locale);
    case 'social':
      return renderSocial(block, ctx);
    case 'code':
      return renderCode(block, ctx);
    case 'share':
      return renderShare(block, ctx);
    case 'poll':
      return renderPoll(block, ctx);
    case 'product':
      return renderProduct(block, ctx);
    case 'video':
      return renderVideo(block, ctx);
    case 'coupon':
      return renderCoupon(block, ctx);
    case 'footer':
      return renderFooter(block, ctx, marketing, locale);
    case 'dynamic':
      return renderDynamic(block, schema, ctx, marketing, locale);
  }
}

function renderText(block: TextBlock, ctx: MergeTagContext): string {
  // Strip any inline HTML the editor might allow inside text blocks; plain
  // text must be tag-free. sanitizeUserText additionally removes the
  // renderer's own opt-out sentinel, which customer text must not be able to
  // forge — stripTags happens to eat it today, but only because it looks
  // enough like a tag, which is not a guarantee to rely on.
  return stripTags(sanitizeUserText(parseMergeTags(block.content, ctx)));
}

function renderImage(block: ImageBlock, ctx: MergeTagContext): string {
  const alt = parseMergeTags(block.alt ?? '', ctx).trim();
  const src = parseMergeTags(block.src, ctx).trim();
  const label = alt || 'Image';
  if (block.link) {
    const href = parseMergeTags(block.link, ctx).trim();
    return `[${label}: ${href}]`;
  }
  return `[${label}${src ? `: ${src}` : ''}]`;
}

function renderButton(block: ButtonBlock, ctx: MergeTagContext): string {
  const text = parseMergeTags(block.text, ctx).trim();
  const url = parseMergeTags(block.url, ctx).trim();
  return `${text} → ${url}`;
}

/**
 * The poll in plain text: the question, then the answers, each followed by the
 * URL that records it.
 *
 * The text half is the half a filter reads and the half a text-only client
 * shows, so leaving the poll out of it would mean a recipient in that client
 * sees an email with a question missing. Without per-recipient URLs the
 * answers are listed without them — same rule as the HTML side.
 */
function renderPoll(block: PollBlock, ctx: MergeTagContext): string {
  const urls = ctx.system?.pollUrls?.[block.id];
  const lines = [parseMergeTags(block.question, ctx)];
  block.options.forEach((option, index) => {
    const label = parseMergeTags(option, ctx);
    const url = urls?.[index];
    lines.push(url ? `- ${label}: ${url}` : `- ${label}`);
  });
  if (block.helpText) lines.push(parseMergeTags(block.helpText, ctx));
  return lines.join('\n');
}

function renderDivider(_block: DividerBlock): string {
  return '----------';
}

function renderSpacer(_block: SpacerBlock): string {
  // Spacer becomes the join separator's blank line; no body.
  return '';
}

function renderColumns(
  block: ColumnsBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  // Plain text doesn't have columns; render each top-to-bottom.
  return block.columns
    .map((col) => col.map((b) => renderBlock(b, schema, ctx, marketing, locale)).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

function renderHero(
  block: HeroBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  return block.content
    .map((b) => renderBlock(b, schema, ctx, marketing, locale))
    .filter(Boolean)
    .join('\n\n');
}

function renderSocial(block: SocialBlock, ctx: MergeTagContext): string {
  const labels: Record<string, string> = {
    facebook: 'Facebook',
    twitter: 'X',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
  };
  const lines = block.networks.map((n) => {
    const url = parseMergeTags(n.url, ctx).trim();
    return `${labels[n.type] ?? n.type}: ${url}`;
  });
  return lines.join('\n');
}

/**
 * Customer HTML in the text half.
 *
 * Reduced to its visible words by the same stripTags every other block uses —
 * a `<table>` layout becomes the sentences inside it, which is what a text
 * client would show anyway. A code block whose HTML has no text at all (a
 * spacer image, a tracking pixel) contributes nothing, and that is correct:
 * inventing a placeholder like "[HTML block]" would put words in the message
 * that the sender never wrote.
 */
function renderCode(block: CodeBlock, ctx: MergeTagContext): string {
  return stripTags(sanitizeUserText(parseMergeTags(block.html, ctx)));
}

/** Share links as plain lines. Nothing at all when there is nothing to share. */
function renderShare(block: ShareBlock, ctx: MergeTagContext): string {
  const targets = shareTargets(block, ctx);
  if (targets.length === 0) return '';
  const label = block.label.trim() ? stripTags(parseMergeTags(block.label, ctx)) : '';
  const lines = targets.map((t) => `${t.label}: ${t.url}`);
  return [label, ...lines].filter(Boolean).join('\n');
}

function renderProduct(block: ProductBlock, ctx: MergeTagContext): string {
  const title = parseMergeTags(block.title, ctx).trim();
  const price = parseMergeTags(block.price, ctx).trim();
  const compare = parseMergeTags(block.compareAtPrice ?? '', ctx).trim();
  const desc = stripTags(parseMergeTags(block.description ?? '', ctx));
  const url = parseMergeTags(block.productUrl, ctx).trim();
  const cta = parseMergeTags(block.ctaText, ctx).trim();
  const priceLine = compare ? `${price} (was ${compare})` : price;
  return [title, priceLine, desc, `${cta} → ${url}`].filter(Boolean).join('\n');
}

function renderVideo(block: VideoBlock, ctx: MergeTagContext): string {
  const label = parseMergeTags(block.alt ?? '', ctx).trim() || 'Watch video';
  const url = parseMergeTags(block.videoUrl, ctx).trim();
  return `▶ ${label} → ${url}`;
}

function renderCoupon(block: CouponBlock, ctx: MergeTagContext): string {
  const code = parseMergeTags(block.code, ctx).trim();
  const headline = parseMergeTags(block.headline ?? '', ctx).trim();
  const description = stripTags(parseMergeTags(block.description ?? '', ctx));
  const expiry = parseMergeTags(block.expiryText ?? '', ctx).trim();
  const ctaText = parseMergeTags(block.ctaText ?? '', ctx).trim();
  const ctaUrl = parseMergeTags(block.ctaUrl ?? '', ctx).trim();
  const lines = [headline, `Code: ${code}`, description, expiry];
  if (ctaText && ctaUrl) lines.push(`${ctaText} → ${ctaUrl}`);
  return lines.filter(Boolean).join('\n');
}

function renderFooter(
  block: FooterBlock,
  ctx: MergeTagContext,
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  const body = stripTags(parseMergeTags(block.content, ctx));
  // The postal address rode along on the HTML side only. Same rule here, from
  // the same helper — a text part is a legal copy of the message, not a summary.
  const lines = [body, ...postalAddressLines(ctx)];
  if (mustShowOptOut(marketing, block.showUnsubscribe)) {
    lines.push(`${OPT_OUT_MARK}${unsubscribeLabel(locale)}: ${optOutUrl(ctx)}`);
  }
  return lines.filter(Boolean).join('\n');
}

function renderDynamic(
  block: DynamicBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  marketing: boolean,
  locale: RenderLocale | undefined,
): string {
  const branch = evaluateCondition(block.condition, ctx.contact ?? undefined)
    ? block.ifContent
    : block.elseContent;
  return branch
    .map((b) => renderBlock(b, schema, ctx, marketing, locale))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Minimal HTML→text conversion. Strips tags and decodes a handful of common
 * entities. Sufficient for editor-authored content; aggressive sanitisation
 * (Liquid + raw HTML pasted in) is the editor's job upstream.
 */
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
