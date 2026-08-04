/**
 * Product card scraper — fetch a product URL and extract structured data via Claude API.
 *
 * Returns a lightweight ProductCard suitable for use in email block editors.
 */

import crypto from 'node:crypto';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CACHE_TTL = 60 * 60 * 6; // 6 h — product data can change, so shorter than AI prompts

export interface ProductCard {
  title: string;
  description: string;
  price: string | null;
  currency: string | null;
  imageUrl: string | null;
  url: string;
}

const SCRAPER_SYSTEM_PROMPT = `You are a product data extractor. Given raw HTML from a product page, extract the following fields and return ONLY valid JSON — no markdown, no explanation:

{
  "title": string,           // product name
  "description": string,     // short description (max 300 chars), summarise if needed
  "price": string | null,    // numeric string e.g. "49.99", null if not found
  "currency": string | null, // ISO 4217 code e.g. "CZK", "EUR", "USD", null if unknown
  "imageUrl": string | null  // absolute URL of the main product image, null if not found
}

Rules:
- title must not be empty
- description: strip HTML tags, keep plain text only
- price: digits and decimal separator only (no currency symbols)
- currency: infer from locale/symbol (Kč→CZK, €→EUR, $→USD, £→GBP)
- imageUrl: prefer og:image or the largest product photo`;

/**
 * Fetch the HTML of a URL, stripping scripts and styles to reduce token count.
 */
async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ForgeMsg/1.0; +https://forgemsg.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      throw AppError.badRequest(`Product URL returned HTTP ${res.status}`);
    }
    html = await res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw AppError.badRequest('Product URL timed out after 10 seconds');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // Strip script, style, svg tags to reduce token usage (~70%)
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .slice(0, 30_000); // hard cap — Claude context budget
}

/**
 * Scrape a product URL and return structured ProductCard data.
 *
 * Results are cached in Redis for 6 hours keyed by URL hash.
 */
export async function scrapeProduct(url: string, apiKey: string): Promise<ProductCard> {
  const cacheKey = `scrape:product:${crypto.createHash('sha256').update(url).digest('hex')}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as ProductCard;
  }

  const html = await fetchPageHtml(url);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SCRAPER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract product data from this HTML:\n\n${html}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw AppError.internal(`Claude API error during product scraping: ${err}`);
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = result.content.find((c) => c.type === 'text')?.text ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw AppError.internal('AI returned invalid JSON for product data');
  }

  const card = parsed as Record<string, unknown>;
  if (!card.title || typeof card.title !== 'string') {
    throw AppError.internal('AI could not extract a product title from this URL');
  }

  const product: ProductCard = {
    title: String(card.title),
    description: String(card.description ?? ''),
    price: card.price != null ? String(card.price) : null,
    currency: card.currency != null ? String(card.currency) : null,
    imageUrl: card.imageUrl != null ? String(card.imageUrl) : null,
    url,
  };

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(product));

  return product;
}
