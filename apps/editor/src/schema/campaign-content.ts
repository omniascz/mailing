/**
 * What is actually inside `campaigns.content`, and how to get a schema out of it.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * The column is `z.record(z.unknown())` — the API validates nothing about it —
 * and four different shapes are stored in it today:
 *
 *   { blocks, globalStyles, … }   a flat EmailSchema. What the tests write.
 *   { schema, html }              what the VISUAL EDITOR writes. The primary
 *                                 authoring path in the product.
 *   { html }  / { html, text }    raw HTML: the Resend-compat broadcasts API,
 *                                 the MCP server, the seed, the HTML form.
 *   { items, sourceFeed, … }      RSS campaign drafts. No longer written:
 *                                 api/services/rss builds a block schema now,
 *                                 because this shape reached the send path's
 *                                 JSON.stringify fallback. Still recognised —
 *                                 as 'unknown' — since the column is
 *                                 z.record(z.unknown()) and old rows may exist.
 *
 * Both consumers — the send path in workers/jobs/batch-sender.ts and the
 * archive page in api/services/campaigns/browser-view.ts — asked the same
 * question with the same expression:
 *
 *     if ('blocks' in content && Array.isArray(content.blocks))
 *
 * which is FALSE for `{ schema, html }`, because the blocks are one level down.
 * So the product's main editor produced campaigns that went down the raw-HTML
 * branch, skipping the renderer and everything the renderer applies. That was
 * not a legacy-format problem; it was the normal path.
 *
 * One function, so the two consumers cannot answer it differently again. It
 * returns a schema or null; it deliberately does NOT decide what to do about
 * null, because the send path and the archive page make different choices
 * there and that difference is real.
 */

import { emailSchema, type EmailSchema } from './blocks.js';

/** The shapes `campaigns.content` is known to hold. Reported, not guessed at. */
export type CampaignContentShape =
  | 'blocks' // flat EmailSchema
  | 'schema' // { schema, html } — the visual editor
  | 'raw-html' // { html } — Resend-compat, MCP, seed, the HTML form
  | 'unknown'; // anything else, including the RSS `{ items }` draft

export interface CampaignContentResult {
  shape: CampaignContentShape;
  /** Present for 'blocks' and 'schema' once the schema parses. */
  schema: EmailSchema | null;
  /**
   * Why a schema is not available, when the shape said there should be one.
   * A `{ schema }` campaign whose schema no longer parses is a real event —
   * a block type removed, a field renamed — and silently rendering it as raw
   * HTML is how that stopped being visible.
   */
  error?: string;
}

/**
 * Read `campaigns.content` and hand back an EmailSchema when there is one.
 *
 * `preheader` is threaded in because it lives on the campaign row rather than
 * inside the content, and the renderer wants it on the schema.
 *
 * Precedence is top-level `blocks` before `schema`. Not because both occur
 * together in practice, but because a flat EmailSchema is what the renderer's
 * own type is, and preferring the shape that needs no unwrapping keeps the old
 * behaviour exactly where it was already correct.
 */
export function readCampaignContent(
  content: Record<string, unknown> | null | undefined,
  preheader?: string,
): CampaignContentResult {
  if (!content || typeof content !== 'object') return { shape: 'unknown', schema: null };

  /**
   * The row's preheader fills in only where the content has none.
   *
   * A plain `{ preheader, ...content }` spread lets the content's value win
   * even when that value is `''` — which is what the visual editor stores for
   * a campaign whose preheader was typed into the HTML form instead. An empty
   * string is an absence, not a choice, so it does not get to beat the row.
   */
  const withPreheader = (candidate: unknown): Record<string, unknown> => {
    const own = candidate as Record<string, unknown>;
    const ownPreheader = typeof own.preheader === 'string' ? own.preheader.trim() : '';
    return { ...own, preheader: ownPreheader || (preheader ?? '') };
  };

  if (Array.isArray((content as { blocks?: unknown }).blocks)) {
    const parsed = emailSchema.safeParse(withPreheader(content));
    return parsed.success
      ? { shape: 'blocks', schema: parsed.data }
      : { shape: 'blocks', schema: null, error: parsed.error.message };
  }

  const nested = (content as { schema?: unknown }).schema;
  if (
    nested &&
    typeof nested === 'object' &&
    Array.isArray((nested as { blocks?: unknown }).blocks)
  ) {
    const parsed = emailSchema.safeParse(withPreheader(nested));
    return parsed.success
      ? { shape: 'schema', schema: parsed.data }
      : { shape: 'schema', schema: null, error: parsed.error.message };
  }

  if (
    typeof (content as { html?: unknown }).html === 'string' &&
    (content as { html: string }).html
  ) {
    return { shape: 'raw-html', schema: null };
  }

  return { shape: 'unknown', schema: null };
}
