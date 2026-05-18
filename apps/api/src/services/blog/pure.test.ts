import { describe, it, expect } from 'vitest';
import {
  slugify,
  uniqueSlug,
  extractExcerpt,
  estimateReadTimeMinutes,
  isDueToPublish,
  pickCtaVariant,
  computeCtaPerformance,
  type CtaVariant,
} from './pure.js';

describe('slugify', () => {
  it('lowercases + strips diacritics', () => {
    expect(slugify('Pražská kronika')).toBe('prazska-kronika');
  });

  it('collapses spaces and punctuation', () => {
    expect(slugify('Hello,    World!!!')).toBe('hello-world');
  });

  it('truncates at maxLength', () => {
    expect(slugify('a'.repeat(200), 20).length).toBeLessThanOrEqual(20);
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('---title---')).toBe('title');
  });
});

describe('uniqueSlug', () => {
  it('returns base when unused', () => {
    expect(uniqueSlug('my-post', new Set())).toBe('my-post');
  });

  it('suffixes -2, -3, … on collisions', () => {
    const existing = new Set(['my-post', 'my-post-2']);
    expect(uniqueSlug('my-post', existing)).toBe('my-post-3');
  });

  it('honours maxLength when suffixing', () => {
    const base = 'a'.repeat(128);
    const existing = new Set([base]);
    const result = uniqueSlug(base, existing, 128);
    expect(result.length).toBeLessThanOrEqual(128);
    expect(result.endsWith('-2')).toBe(true);
  });
});

describe('extractExcerpt', () => {
  it('strips HTML tags', () => {
    expect(extractExcerpt('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('truncates at word boundary', () => {
    const body = 'The quick brown fox jumps over the lazy dog and then some';
    const out = extractExcerpt(body, 30);
    expect(out.length).toBeLessThanOrEqual(32);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('thesome'); // didn't cut a word
  });

  it('returns short body as-is', () => {
    expect(extractExcerpt('Short')).toBe('Short');
  });
});

describe('estimateReadTimeMinutes', () => {
  it('returns at least 1 minute', () => {
    expect(estimateReadTimeMinutes('Short')).toBe(1);
  });

  it('scales with word count', () => {
    const body = Array.from({ length: 440 }, () => 'word').join(' ');
    expect(estimateReadTimeMinutes(body)).toBe(2);
  });
});

describe('isDueToPublish', () => {
  const now = new Date('2026-04-24T12:00:00Z');

  it('fires when scheduled time elapsed', () => {
    expect(
      isDueToPublish('scheduled', new Date('2026-04-24T11:00:00Z'), now),
    ).toBe(true);
  });

  it('skips when future-scheduled', () => {
    expect(
      isDueToPublish('scheduled', new Date('2026-04-24T13:00:00Z'), now),
    ).toBe(false);
  });

  it('skips non-scheduled statuses', () => {
    expect(isDueToPublish('draft', new Date('2025-01-01'), now)).toBe(false);
    expect(isDueToPublish('published', new Date('2025-01-01'), now)).toBe(false);
  });

  it('skips when scheduledAt is null', () => {
    expect(isDueToPublish('scheduled', null, now)).toBe(false);
  });
});

describe('pickCtaVariant', () => {
  const variants: CtaVariant[] = [
    { id: 'a', weight: 3 },
    { id: 'b', weight: 1 },
  ];

  it('returns null when empty', () => {
    expect(pickCtaVariant([])).toBeNull();
  });

  it('deterministic with custom rng', () => {
    expect(pickCtaVariant(variants, () => 0)?.id).toBe('a');
    expect(pickCtaVariant(variants, () => 0.9)?.id).toBe('b');
  });

  it('ignores zero-weight variants', () => {
    const withZero: CtaVariant[] = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 1 },
    ];
    expect(pickCtaVariant(withZero, () => 0.5)?.id).toBe('b');
  });

  it('falls back to first variant when all weights are 0', () => {
    const zeros: CtaVariant[] = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 0 },
    ];
    expect(pickCtaVariant(zeros)?.id).toBe('a');
  });
});

describe('computeCtaPerformance', () => {
  it('computes CTR, dismiss rate, engagement rate', () => {
    const res = computeCtaPerformance({
      impressions: 1000,
      clicks: 50,
      dismissals: 200,
    });
    expect(res.ctr).toBeCloseTo(0.05, 4);
    expect(res.dismissRate).toBeCloseTo(0.2, 4);
    // Among 800 non-dismissed, 50 clicked → 6.25%
    expect(res.engagementRate).toBeCloseTo(50 / 800, 4);
  });

  it('handles zero impressions', () => {
    const res = computeCtaPerformance({ impressions: 0, clicks: 0, dismissals: 0 });
    expect(res).toMatchObject({ ctr: 0, dismissRate: 0, engagementRate: 0 });
  });

  it('handles 100% dismissal without dividing by zero', () => {
    const res = computeCtaPerformance({ impressions: 100, clicks: 0, dismissals: 100 });
    expect(res.engagementRate).toBe(0);
  });
});
