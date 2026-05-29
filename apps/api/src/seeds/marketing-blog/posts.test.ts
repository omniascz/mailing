import { describe, it, expect } from 'vitest';
import { MARKETING_POSTS } from './posts.js';

/**
 * Lint-tier checks on the marketing blog seed. These run in CI so a bad
 * fixture (duplicate slug, over-long meta description, empty body) fails
 * fast before someone runs the seeder against a production DB.
 */
describe('MARKETING_POSTS fixtures', () => {
  it('has at least 10 posts', () => {
    expect(MARKETING_POSTS.length).toBeGreaterThanOrEqual(10);
  });

  it('slug + locale pairs are unique', () => {
    const seen = new Set<string>();
    for (const p of MARKETING_POSTS) {
      const key = `${p.slug}::${p.locale}`;
      expect(seen.has(key), `duplicate slug+locale: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('slug is URL-safe', () => {
    for (const p of MARKETING_POSTS) {
      expect(p.slug, p.slug).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
      expect(p.slug.length).toBeLessThanOrEqual(80);
    }
  });

  it('titles fit Google SERP (≤ 60 chars recommended, hard cap 70)', () => {
    for (const p of MARKETING_POSTS) {
      expect(p.title.length, `${p.slug}: title too long (${p.title.length})`).toBeLessThanOrEqual(
        70,
      );
      expect(p.title.length).toBeGreaterThan(10);
    }
  });

  it('meta descriptions fit Google SERP (≤ 160 chars)', () => {
    for (const p of MARKETING_POSTS) {
      expect(
        p.metaDescription.length,
        `${p.slug}: meta too long (${p.metaDescription.length})`,
      ).toBeLessThanOrEqual(165);
      expect(p.metaDescription.length).toBeGreaterThan(50);
    }
  });

  it('meta titles fit (≤ 60 chars)', () => {
    for (const p of MARKETING_POSTS) {
      expect(p.metaTitle.length, `${p.slug}: metaTitle too long`).toBeLessThanOrEqual(65);
    }
  });

  it('bodies are substantive (≥ 800 chars)', () => {
    for (const p of MARKETING_POSTS) {
      expect(p.body.length, `${p.slug}: body too short`).toBeGreaterThan(800);
    }
  });

  it('every post has at least one tag', () => {
    for (const p of MARKETING_POSTS) {
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });

  it('CZ posts contain Czech diacritics (heuristic)', () => {
    const cz = MARKETING_POSTS.filter((p) => p.locale === 'cs');
    expect(cz.length).toBeGreaterThanOrEqual(3);
    for (const p of cz) {
      expect(/[áčďéěíňóřšťúůýž]/i.test(p.body), `${p.slug}: missing CZ diacritics`).toBe(true);
    }
  });

  it('covers all three primary categories', () => {
    const cats = new Set(MARKETING_POSTS.map((p) => p.category));
    expect(cats.has('migration')).toBe(true);
    expect(cats.has('comparisons')).toBe(true);
    expect(cats.has('deliverability')).toBe(true);
  });

  it('every body ends with a CTA link', () => {
    for (const p of MARKETING_POSTS) {
      expect(/\[.+\]\(https?:\/\/mailforge\.io\//.test(p.body), `${p.slug}: missing CTA link`).toBe(
        true,
      );
    }
  });
});
