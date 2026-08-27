/**
 * What a feed becomes before it is stored.
 *
 * These are unit tests on the builder alone — they prove the shape and the
 * escaping, NOT that the result renders to safe HTML. The renderer, the
 * sanitiser, the compliance footer and UTM are exercised against a real
 * database and a real send path in
 * apps/workers/src/integration/rss-campaign.integration.test.ts. Neither file
 * substitutes for the other: this one would keep passing if the renderer
 * changed under it, and that one would keep passing if this builder were
 * bypassed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCampaignContent } from '@forgemsg/editor/schema';
import {
  buildRssEmailSchema,
  buildRssCampaignContent,
  escapeHtml,
  safeLink,
} from './email-schema.js';
import type { RssItem } from './index.js';

const item = (over: Partial<RssItem> = {}): RssItem => ({
  guid: 'g1',
  title: 'Nové boty na podzim',
  link: 'https://eshop.example/blog/boty',
  description: 'Podzimní kolekce je skladem.',
  pubDate: new Date('2026-08-25T08:00:00.000Z'),
  ...over,
});

describe('buildRssCampaignContent — the object that goes in campaigns.content', () => {
  it('is the shape the send path renders, not the shape it stringifies', () => {
    // The whole point. `{ items, sourceFeed, generatedFrom }` was reported as
    // 'unknown', which is batch-sender's JSON.stringify branch.
    const content = buildRssCampaignContent('Novinky', [item()], 'https://eshop.example/rss');
    const got = readCampaignContent(content as Record<string, unknown>);
    expect(got.shape).toBe('blocks');
    expect(got.schema, got.error ?? 'no schema and no error').not.toBeNull();
  });

  it('keeps the feed URL as provenance without disturbing the parse', () => {
    const content = buildRssCampaignContent('Novinky', [item()], 'https://eshop.example/rss');
    expect(content.sourceFeed).toBe('https://eshop.example/rss');
    expect(content.generatedFrom).toBe('rss');
    // emailSchema strips unknown keys, so the renderer never sees them.
    const got = readCampaignContent(content as Record<string, unknown>);
    expect(got.schema).not.toHaveProperty('sourceFeed');
  });

  it('has no items key at all — nothing downstream can fall back to it', () => {
    const content = buildRssCampaignContent('Novinky', [item()], 'https://eshop.example/rss');
    expect(content).not.toHaveProperty('items');
  });
});

describe('buildRssEmailSchema — feed items as blocks', () => {
  it('puts the title and the link in the body', () => {
    const schema = buildRssEmailSchema('Novinky', [item()]);
    const html = schema.blocks
      .map((b: Record<string, unknown>) => String(b.content ?? ''))
      .join('');
    expect(html).toContain('Nové boty na podzim');
    expect(html).toContain('href="https://eshop.example/blog/boty"');
    expect(html).toContain('Podzimní kolekce je skladem.');
  });

  it('separates items with a divider, and does not trail one', () => {
    const schema = buildRssEmailSchema('Novinky', [
      item({ guid: 'a' }),
      item({ guid: 'b' }),
      item({ guid: 'c' }),
    ]);
    const types = schema.blocks.map((b: Record<string, unknown>) => b.type);
    expect(types).toEqual(['text', 'divider', 'text', 'divider', 'text']);
  });

  it('parses as an EmailSchema even when a feed gives nothing usable', () => {
    // A feed item with no link and no title is not a reason to drop the whole
    // campaign back to the raw branch. This is the case a `button` block would
    // have failed on: its `url` is required and must parse.
    const schema = buildRssEmailSchema('Novinky', [
      item({ title: '', link: '', description: undefined, pubDate: undefined }),
    ]);
    const got = readCampaignContent(schema as unknown as Record<string, unknown>);
    expect(got.shape).toBe('blocks');
    expect(got.schema, got.error ?? 'no schema and no error').not.toBeNull();
  });

  it('an empty feed still produces a parseable schema', () => {
    const got = readCampaignContent(
      buildRssEmailSchema('Novinky', []) as unknown as Record<string, unknown>,
    );
    expect(got.shape).toBe('blocks');
    expect(got.schema?.blocks).toEqual([]);
  });
});

describe('feed text is escaped where it is written, not only where it is rendered', () => {
  it('escapes a title that carries markup', () => {
    // parseRssXml runs cleanText, which strips TAGS — it is not an escaper, and
    // it never sees text that arrives by another route. Escaping here does not
    // depend on it.
    const schema = buildRssEmailSchema('Novinky', [
      item({ title: '<script>alert(1)</script>Sleva' }),
    ]);
    const html = schema.blocks
      .map((b: Record<string, unknown>) => String(b.content ?? ''))
      .join('');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes an attribute-breaking description', () => {
    const schema = buildRssEmailSchema('Novinky', [
      item({ description: '"><img src=x onerror=alert(1)>' }),
    ]);
    const html = schema.blocks
      .map((b: Record<string, unknown>) => String(b.content ?? ''))
      .join('');
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('escapeHtml covers the five characters that matter', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('safeLink — which feed links are allowed to become an href', () => {
  it('accepts http and https', () => {
    expect(safeLink('https://eshop.example/a')).toBe('https://eshop.example/a');
    expect(safeLink('http://eshop.example/a')).toBe('http://eshop.example/a');
  });

  it('refuses javascript:, which new URL() considers perfectly valid', () => {
    // This is why the link is not a button block: buttonBlockSchema.url is
    // z.string().url(), and `javascript:alert(1)` passes that.
    expect(new URL('javascript:alert(1)').protocol).toBe('javascript:');
    expect(safeLink('javascript:alert(1)')).toBeNull();
  });

  it('refuses data: and relative links', () => {
    expect(safeLink('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeLink('/blog/boty')).toBeNull();
    expect(safeLink('')).toBeNull();
    expect(safeLink(undefined)).toBeNull();
  });

  it('a refused link produces a heading with no anchor at all', () => {
    const schema = buildRssEmailSchema('Novinky', [item({ link: 'javascript:alert(1)' })]);
    const html = schema.blocks
      .map((b: Record<string, unknown>) => String(b.content ?? ''))
      .join('');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
    expect(html).toContain('Nové boty na podzim');
  });
});

/**
 * SCAN — the one thing the tests above cannot reach.
 *
 * Everything else here calls the builder directly, so all of it would keep
 * passing if processOne stopped calling it and went back to storing the parsed
 * feed. processOne is private, and reaching it means a live HTTP feed (parseFeed
 * runs safeFetch, which refuses loopback addresses), so the call site is
 * asserted on the source.
 *
 * WHAT THIS SCAN CANNOT SEE:
 *   - whether processOne is reached at all, or whether the insert runs
 *   - what `subject`, `fresh` or `rss.feedUrl` actually hold at that point
 *   - a SECOND writer of campaigns.content elsewhere in the product that
 *     stores the old shape; this looks at one file
 *   - a call that is present but commented out — a `//` before it still
 *     contains the text (pinned by the near-miss self-test below)
 */
const RSS_SRC = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), 'index.ts'),
  'utf8',
);

/** Kept beside its self-tests so the matcher is never asserted unexamined. */
const storesBuiltContent = (src: string): boolean =>
  /(^|[^/\s])\s*content: buildRssCampaignContent\(/m.test(src);

describe('SCAN: processOne stores what this builder produced', () => {
  it('SELF-TEST: the matcher fires on a positive control', () => {
    expect(storesBuiltContent('      content: buildRssCampaignContent(subject, fresh, url),')).toBe(
      true,
    );
  });

  it('SELF-TEST: the matcher does not fire on near misses', () => {
    expect(storesBuiltContent('content: { items: fresh, sourceFeed: url },')).toBe(false);
    expect(storesBuiltContent('// content: buildRssCampaignContent(subject, fresh, url),')).toBe(
      false,
    );
    expect(storesBuiltContent('export function buildRssCampaignContent(')).toBe(false);
    expect(storesBuiltContent('')).toBe(false);
  });

  it('SELF-TEST: the file it reads is the RSS service and is not empty', () => {
    expect(RSS_SRC.length).toBeGreaterThan(500);
    expect(RSS_SRC).toContain('async function processOne(');
  });

  it('the insert stores the built content, not the parsed feed', () => {
    expect(storesBuiltContent(RSS_SRC)).toBe(true);
    expect(RSS_SRC).not.toContain('content: { items:');
  });
});
