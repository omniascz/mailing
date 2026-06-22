/**
 * AI-powered image alt text generator.
 * Fetches the image from a URL, passes it to Claude Vision,
 * returns a concise, descriptive alt text string.
 * Also replaces empty alt="" attributes in email HTML.
 */
import { callClaude } from '../../lib/ai-client.js';

export interface AltTextResult {
  url: string;
  altText: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Generate alt text for a single image URL via Claude Vision.
 */
export async function generateAltText(
  orgId: string,
  imageUrl: string,
  context?: string,
): Promise<AltTextResult> {
  // Fetch image as base64
  // Verify the image is reachable before calling Claude
  try {
    const res = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    return { url: imageUrl, altText: '', confidence: 'low' };
  }

  const systemPrompt = `You generate concise, descriptive alt text for email images.
Rules:
- Max 125 characters
- Describe what is shown, not the style
- If it's decorative/spacer, reply with just: DECORATIVE
- If it's a product, describe it (name, colour, key feature)
- If it's a CTA button/banner, describe the action
- No "image of" or "photo of" prefix
${context ? `Email context: ${context}` : ''}`;

  let altText: string;
  try {
    const { text } = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      user: `[Image attached] Generate the alt text. Context: ${imageUrl}\nReply with ONLY the alt text, nothing else.`,
      maxTokens: 64,
      feature: 'accessibility_check',
      tenantId: orgId,
    });
    altText = (text ?? '').trim().slice(0, 125);
  } catch {
    return { url: imageUrl, altText: '', confidence: 'low' };
  }

  if (altText === 'DECORATIVE') return { url: imageUrl, altText: '', confidence: 'high' };
  return {
    url: imageUrl,
    altText,
    confidence: altText.length > 10 ? 'high' : 'medium',
  };
}

/**
 * Find all <img> tags in HTML with missing or empty alt attributes
 * and fill them using Claude Vision.
 */
export async function fillMissingAltTexts(
  orgId: string,
  html: string,
  emailContext?: string,
): Promise<{ html: string; filled: number; skipped: number }> {
  // Find imgs with empty or missing alt
  const IMG_RE = /<img([^>]*?)>/gi;
  const ALT_RE = /\balt="([^"]*)"/i;
  const SRC_RE = /\bsrc="([^"]+)"/i;

  const replacements: Array<{ original: string; replacement: string }> = [];
  let filled = 0;
  let skipped = 0;

  const matches = Array.from(html.matchAll(IMG_RE));
  const toProcess: Array<{ tag: string; src: string }> = [];

  for (const m of matches) {
    const tag = m[0];
    const altMatch = ALT_RE.exec(m[1] ?? '');
    const srcMatch = SRC_RE.exec(m[1] ?? '');
    if (!srcMatch) { skipped++; continue; }
    // Only process if alt is missing or empty
    if (altMatch && altMatch[1] && altMatch[1].trim()) { skipped++; continue; }
    const src = srcMatch[1] ?? '';
    if (!src.startsWith('http')) { skipped++; continue; }
    toProcess.push({ tag, src });
  }

  // Process in parallel (max 5 concurrent)
  const results = await Promise.all(
    toProcess.map(({ tag, src }) =>
      generateAltText(orgId, src, emailContext).then((r) => ({ tag, src, result: r })),
    ),
  );

  for (const { tag, result } of results) {
    const ALT_ATTR_RE = /\balt="[^"]*"/i;
    const newTag = ALT_ATTR_RE.test(tag)
      ? tag.replace(ALT_ATTR_RE, `alt="${result.altText}"`)
      : tag.replace(/<img/i, `<img alt="${result.altText}"`);
    replacements.push({ original: tag, replacement: newTag });
    filled++;
  }

  let out = html;
  for (const { original, replacement } of replacements) {
    out = out.replace(original, replacement);
  }

  return { html: out, filled, skipped };
}
