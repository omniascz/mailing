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

export interface RenderOptions {
  context?: MergeTagContext;
  /**
   * When true, DynamicBlocks render both branches as sibling content wrapped
   * in a marker comment. Useful for the editor's "show all" preview mode so
   * authors can proofread both variants at once.
   */
  previewAllDynamicBranches?: boolean;
}

export interface RenderResult {
  html: string;
  /** Flat list of unique links found in the rendered HTML (for link checker). */
  links: string[];
}

export function renderEmail(schema: EmailSchema, opts: RenderOptions = {}): RenderResult {
  const ctx = opts.context ?? {};
  const preview = opts.previewAllDynamicBranches === true;
  const links: string[] = [];

  const body = schema.blocks.map((b) => renderBlock(b, schema, ctx, preview, links)).join('\n');

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

  // Dedup links, preserve order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const l of links) {
    if (!seen.has(l)) {
      seen.add(l);
      deduped.push(l);
    }
  }

  return { html, links: deduped };
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
      return renderColumns(block, schema, ctx, previewAll, links);
    case 'hero':
      return renderHero(block, schema, ctx, previewAll, links);
    case 'social':
      return renderSocial(block, ctx, links);
    case 'footer':
      return renderFooter(block, ctx, links);
    case 'dynamic':
      return renderDynamic(block, schema, ctx, previewAll, links);
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

function renderFooter(block: FooterBlock, ctx: MergeTagContext, links: string[]): string {
  const body = escapeHtml(parseMergeTags(block.content, ctx));
  let unsub = '';
  if (block.showUnsubscribe) {
    const url = ctx.system?.unsubscribeUrl ?? '{{unsubscribe_url}}';
    links.push(url);
    unsub = `<div style="margin-top:8px;"><a href="${escapeAttr(url)}" style="color:${block.color};text-decoration:underline;">Unsubscribe</a></div>`;
  }
  const style = `font-size:${block.fontSize};color:${block.color};text-align:${block.textAlign};`;
  return `<tr><td${bgAttr(block)} style="padding:${cellPadding(block)};${style}">${body}${unsub}</td></tr>`;
}

// ---------- container blocks ----------

function renderColumns(
  block: ColumnsBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  previewAll: boolean,
  links: string[],
): string {
  const totalRatio = block.columnRatios.reduce((a, b) => a + b, 0) || 1;
  const width = schema.globalStyles.contentWidth;
  const gap = block.gap ?? '0';

  const cells = block.columns
    .map((colBlocks, i) => {
      const ratio = block.columnRatios[i] ?? 1;
      const colWidth = Math.floor((ratio / totalRatio) * width);
      const inner = colBlocks.map((b) => renderBlock(b, schema, ctx, previewAll, links)).join('');
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
): string {
  const bg = block.backgroundColor ?? '#111827';
  const bgImage = block.backgroundImage
    ? `background-image:url('${escapeAttr(block.backgroundImage)}');background-size:cover;background-position:center;`
    : '';
  const minH = block.minHeight ?? '240px';
  const inner = block.content.map((b) => renderBlock(b, schema, ctx, previewAll, links)).join('');
  return `<tr><td bgcolor="${bg}" style="background-color:${bg};${bgImage}min-height:${minH};padding:${cellPadding(block)};"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${inner}</table></td></tr>`;
}

function renderDynamic(
  block: DynamicBlock,
  schema: EmailSchema,
  ctx: MergeTagContext,
  previewAll: boolean,
  links: string[],
): string {
  if (previewAll) {
    const ifHtml = block.ifContent
      .map((b) => renderBlock(b, schema, ctx, previewAll, links))
      .join('');
    const elseHtml = block.elseContent
      .map((b) => renderBlock(b, schema, ctx, previewAll, links))
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
  return branch.map((b) => renderBlock(b, schema, ctx, previewAll, links)).join('');
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
