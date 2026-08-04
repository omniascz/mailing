import { describe, it, expect } from 'vitest';
import {
  bandFromScore,
  detectSpam,
  fallbackSentimentFromRating,
  generateReviewToken,
  suggestInitialStatus,
  summariseRatings,
} from './pure.js';

describe('summariseRatings', () => {
  it('returns zeros for an empty list', () => {
    const r = summariseRatings([]);
    expect(r).toEqual({
      count: 0,
      average: 0,
      distribution: { one: 0, two: 0, three: 0, four: 0, five: 0 },
    });
  });

  it('counts each bucket and averages correctly', () => {
    const r = summariseRatings([5, 5, 4, 3, 1]);
    expect(r.count).toBe(5);
    expect(r.average).toBe(3.6);
    expect(r.distribution).toEqual({ one: 1, two: 0, three: 1, four: 1, five: 2 });
  });

  it('ignores out-of-range ratings', () => {
    const r = summariseRatings([5, 0, 6, -1, 4]);
    expect(r.count).toBe(2);
    expect(r.distribution.five).toBe(1);
    expect(r.distribution.four).toBe(1);
  });

  it('rounds to two decimals', () => {
    const r = summariseRatings([5, 4, 4]);
    expect(r.average).toBe(4.33);
  });
});

describe('detectSpam', () => {
  it('flags obvious keyword spam', () => {
    const r = detectSpam('Free viagra, click here for crypto signal');
    expect(r.likelySpam).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('returns clean for a normal review', () => {
    const r = detectSpam('The product arrived on time and worked exactly as described.');
    expect(r.likelySpam).toBe(false);
    expect(r.score).toBe(0);
  });

  it('flags all-caps title', () => {
    const r = detectSpam('Decent product, recommend.', 'BUY NOW INCREDIBLE DEAL');
    expect(r.reasons).toContain('all_caps_title');
  });

  it('penalises a body stuffed with URLs', () => {
    const body = 'Check https://a.com https://b.com https://c.com for more.';
    const r = detectSpam(body);
    expect(r.reasons).toContain('many_urls');
  });

  it('penalises excessive emoji noise', () => {
    const r = detectSpam('🔥🔥🔥🔥🔥🔥 best ever!!!');
    expect(r.reasons).toContain('emoji_spam');
  });
});

describe('bandFromScore', () => {
  it('classifies above 0.25 as positive', () => {
    expect(bandFromScore(0.5)).toBe('positive');
    expect(bandFromScore(0.25)).toBe('positive');
  });
  it('classifies below -0.25 as negative', () => {
    expect(bandFromScore(-0.5)).toBe('negative');
    expect(bandFromScore(-0.25)).toBe('negative');
  });
  it('classifies the middle as neutral', () => {
    expect(bandFromScore(0)).toBe('neutral');
    expect(bandFromScore(0.2)).toBe('neutral');
  });
});

describe('fallbackSentimentFromRating', () => {
  it('positive for 4-5 stars', () => {
    expect(fallbackSentimentFromRating(5).sentiment).toBe('positive');
    expect(fallbackSentimentFromRating(4).sentiment).toBe('positive');
  });
  it('neutral for 3 stars', () => {
    expect(fallbackSentimentFromRating(3).sentiment).toBe('neutral');
    expect(fallbackSentimentFromRating(3).score).toBe(0);
  });
  it('negative for 1-2 stars', () => {
    expect(fallbackSentimentFromRating(1).sentiment).toBe('negative');
    expect(fallbackSentimentFromRating(2).sentiment).toBe('negative');
  });
});

describe('generateReviewToken', () => {
  it('produces URL-safe random tokens', () => {
    const t = generateReviewToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(32);
  });
  it('is unique across calls', () => {
    expect(generateReviewToken()).not.toBe(generateReviewToken());
  });
});

describe('suggestInitialStatus', () => {
  it('returns spam when the spam check trips', () => {
    expect(
      suggestInitialStatus({
        spam: { score: 80, reasons: [], likelySpam: true },
        rating: 1,
      }),
    ).toBe('spam');
  });

  it('defaults to pending for clean submissions', () => {
    expect(
      suggestInitialStatus({
        spam: { score: 0, reasons: [], likelySpam: false },
        rating: 5,
      }),
    ).toBe('pending');
  });
});
