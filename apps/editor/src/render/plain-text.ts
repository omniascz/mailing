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
  SocialBlock,
  SpacerBlock,
  TextBlock,
} from '../schema/blocks.js';
import type { MergeTagContext } from './merge-tags.js';
import { parseMergeTags } from './merge-tags.js';
import { evaluateCondition } from './evaluate-condition.js';

export interface RenderPlainTextOptions {
  context?: MergeTagContext;
}

export function renderPlainText(schema: EmailSchema, opts: RenderPlainTextOptions = {}): string {
  const ctx = opts.context ?? {};
  const parts: string[] = [];

  const subject = parseMergeTags(schema.subject, ctx).trim();
  if (subject) parts.push(subject);

  const preheader = parseMergeTags(schema.preheader, ctx).trim();
  if (preheader) parts.push(preheader);

  for (const block of schema.blocks) {
    const chunk = renderBlock(block, schema, ctx).trim();
    if (chunk) parts.push(chunk);
  }

  return parts.join('\n\n');
}

function renderBlock(block: Block, schema: EmailSchema, ctx: MergeTagContext): string {
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
      return renderColumns(block, schema, ctx);
    case 'hero':
      return renderHero(block, schema, ctx);
    case 'social':
      return renderSocial(block, ctx);
    case 'footer':
      return renderFooter(block, ctx);
    case 'dynamic':
      return renderDynamic(block, schema, ctx);
  }
}

function renderText(block: TextBlock, ctx: MergeTagContext): string {
  // Strip any inline HTML the editor might allow inside text blocks. The HTML
  // renderer trusts the field, but plain text must be tag-free.
  return stripTags(parseMergeTags(block.content, ctx));
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

function renderDivider(_block: DividerBlock): string {
  return '----------';
}

function renderSpacer(_block: SpacerBlock): string {
  // Spacer becomes the join separator's blank line; no body.
  return '';
}

function renderColumns(block: ColumnsBlock, schema: EmailSchema, ctx: MergeTagContext): string {
  // Plain text doesn't have columns; render each top-to-bottom.
  return block.columns
    .map((col) => col.map((b) => renderBlock(b, schema, ctx)).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

function renderHero(block: HeroBlock, schema: EmailSchema, ctx: MergeTagContext): string {
  return block.content
    .map((b) => renderBlock(b, schema, ctx))
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

function renderFooter(block: FooterBlock, ctx: MergeTagContext): string {
  const body = stripTags(parseMergeTags(block.content, ctx));
  const lines = [body];
  if (block.showUnsubscribe) {
    const url = ctx.system?.unsubscribeUrl ?? '{{unsubscribe_url}}';
    lines.push(`Unsubscribe: ${url}`);
  }
  return lines.filter(Boolean).join('\n');
}

function renderDynamic(block: DynamicBlock, schema: EmailSchema, ctx: MergeTagContext): string {
  const branch = evaluateCondition(block.condition, ctx.contact ?? undefined)
    ? block.ifContent
    : block.elseContent;
  return branch
    .map((b) => renderBlock(b, schema, ctx))
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
