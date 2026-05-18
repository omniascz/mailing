/**
 * HTML → Block JSON conversion service.
 *
 * Sends raw HTML email to Claude Sonnet, which analyses it and returns an
 * EmailSchema-compatible Block array. Result is cached in Redis for 1 hour
 * (keyed on SHA-256 of the input HTML).
 */

import crypto from 'node:crypto';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CACHE_TTL = 60 * 60; // 1 h

// Inline the block schema description so we don't need to import the editor
// package at runtime (avoids bundling React etc. into the API).
const SYSTEM_PROMPT = `You are an expert at converting HTML emails into a structured JSON block schema.

Analyse the provided HTML email and decompose it into blocks using this TypeScript schema:

type Block =
  | { type: "text";    id: string; content: string; fontSize: string; fontFamily: string; color: string; lineHeight: string; textAlign: string; styles?: object }
  | { type: "image";   id: string; src: string; alt: string; width?: number; height?: number; link?: string; align: string; styles?: object }
  | { type: "button";  id: string; text: string; url: string; backgroundColor: string; textColor: string; borderRadius: string; align: string; size: "sm"|"md"|"lg"; styles?: object }
  | { type: "divider"; id: string; color: string; thickness: number; widthPercent: number; styles?: object }
  | { type: "spacer";  id: string; height: number; styles?: object }
  | { type: "columns"; id: string; columns: Block[][]; columnRatios: number[]; gap?: string; styles?: object }
  | { type: "hero";    id: string; backgroundColor: string; backgroundImage?: string; minHeight?: string; content: Block[]; styles?: object }
  | { type: "social";  id: string; networks: {type:"facebook"|"twitter"|"instagram"|"linkedin"|"youtube"; url: string}[]; iconSize: number; align: string; styles?: object }
  | { type: "footer";  id: string; content: string; showUnsubscribe: boolean; color: string; fontSize: string; textAlign: string; styles?: object }

Rules:
- Every block MUST have a unique "id" (use short strings like "b1", "b2" …)
- Preserve all text content including HTML tags inside text block "content"
- Extract actual image src URLs, button hrefs, colours as hex strings
- Group related elements into columns or hero blocks where layout clearly warrants it
- Split large text sections into separate text blocks if they have different styling
- Return ONLY valid JSON — no markdown, no explanation — in this shape:
{
  "subject": "<detected subject or empty string>",
  "preheader": "<detected preheader or empty string>",
  "globalStyles": { "backgroundColor": "#ffffff", "fontFamily": "Arial, Helvetica, sans-serif", "linkColor": "#2563eb", "textColor": "#1f2937", "contentWidth": 600, "contentBackgroundColor": "#ffffff" },
  "blocks": [ /* Block[] */ ]
}`;

export interface ConvertedEmail {
  subject: string;
  preheader: string;
  globalStyles: Record<string, unknown>;
  blocks: unknown[];
}

/**
 * Convert raw HTML email string to ForgeMsg EmailSchema-compatible JSON.
 *
 * @param html   Raw HTML email content (max 80 KB, stripped to 30 KB before API call)
 * @param apiKey Anthropic API key
 */
export async function htmlToBlocks(html: string, apiKey: string): Promise<ConvertedEmail> {
  const cacheKey = `editor:html2blocks:${crypto.createHash('sha256').update(html).digest('hex')}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as ConvertedEmail;
  }

  // Strip heavy noise before sending to Claude
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s{3,}/g, '  ')
    .slice(0, 30_000);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Convert this HTML email:\n\n${stripped}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw AppError.internal(`Claude API error during HTML conversion: ${err}`);
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = result.content.find((c) => c.type === 'text')?.text ?? '';

  // Strip markdown code fences if Claude wrapped the JSON anyway
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw AppError.internal('AI returned invalid JSON during HTML → blocks conversion');
  }

  const schema = parsed as Record<string, unknown>;
  if (!Array.isArray(schema.blocks)) {
    throw AppError.internal('AI response missing "blocks" array');
  }

  const result2: ConvertedEmail = {
    subject: String(schema.subject ?? ''),
    preheader: String(schema.preheader ?? ''),
    globalStyles: (schema.globalStyles as Record<string, unknown>) ?? {},
    blocks: schema.blocks,
  };

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result2));

  return result2;
}
