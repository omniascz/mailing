import { describe, it, expect } from 'vitest';
import {
  POST_LIMITS,
  HASHTAG_LIMITS,
  isSupportedPlatform,
  extractHashtags,
  mergeHashtags,
  fitForPlatform,
  pickBestTimeSlots,
  validateCrossPost,
  type EngagementHistogramEntry,
} from './pure.js';

describe('isSupportedPlatform', () => {
  it('accepts known platforms', () => {
    expect(isSupportedPlatform('twitter')).toBe(true);
    expect(isSupportedPlatform('instagram')).toBe(true);
  });

  it('rejects unknown platforms', () => {
    expect(isSupportedPlatform('myspace')).toBe(false);
  });
});

describe('POST_LIMITS / HASHTAG_LIMITS', () => {
  it('has sensible Twitter/X limits', () => {
    expect(POST_LIMITS.twitter).toBe(280);
    expect(HASHTAG_LIMITS.twitter).toBeLessThan(HASHTAG_LIMITS.instagram);
  });
});

describe('extractHashtags', () => {
  it('extracts in document order', () => {
    expect(extractHashtags('Check out our #launch! #MailForge is live #launch')).toEqual([
      '#launch',
      '#MailForge',
    ]);
  });

  it('ignores mid-word hashes', () => {
    expect(extractHashtags('email#1 priority #real')).toEqual(['#real']);
  });

  it('handles unicode (cs/sk letters)', () => {
    expect(extractHashtags('#čeština je #super')).toEqual(['#čeština', '#super']);
  });

  it('returns empty for no hashtags', () => {
    expect(extractHashtags('plain text only')).toEqual([]);
  });
});

describe('mergeHashtags', () => {
  it('appends defaults when under limit', () => {
    const out = mergeHashtags('Hello world', ['#mailforge', 'launch'], 'twitter');
    expect(out).toContain('#mailforge');
    expect(out).toContain('#launch');
  });

  it('caps at platform hashtag limit', () => {
    const out = mergeHashtags(
      'body',
      ['#a', '#b', '#c', '#d'],
      'twitter', // limit 2
    );
    const tags = extractHashtags(out);
    expect(tags.length).toBe(2);
  });

  it('does not duplicate existing hashtags', () => {
    const out = mergeHashtags('#launch hooray', ['#Launch'], 'linkedin');
    // Extractor is case-preserving but dedup is case-insensitive
    const tags = extractHashtags(out);
    const lower = tags.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it('is a no-op when already at limit', () => {
    const body = '#a #b plenty #c';
    expect(mergeHashtags(body, ['#d'], 'twitter')).toBe(body);
  });
});

describe('fitForPlatform', () => {
  it('returns body unchanged when it fits', () => {
    expect(fitForPlatform('short', 'twitter')).toBe('short');
  });

  it('truncates to platform ceiling with ellipsis', () => {
    const body = 'a'.repeat(300);
    const out = fitForPlatform(body, 'twitter');
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith('…')).toBe(true);
  });

  it('prefers word boundary over mid-word cut', () => {
    const body = 'word '.repeat(100);
    const out = fitForPlatform(body, 'twitter');
    expect(out).not.toMatch(/wor…$/); // not cut in the middle of a word
  });
});

describe('pickBestTimeSlots', () => {
  const histo: EngagementHistogramEntry[] = [
    { dayOfWeek: 1, hour: 9, score: 0.7 },
    { dayOfWeek: 2, hour: 12, score: 0.9 },
    { dayOfWeek: 3, hour: 18, score: 0.9 },
    { dayOfWeek: 4, hour: 7, score: 0.3 },
  ];

  it('returns top-N by score', () => {
    const top = pickBestTimeSlots(histo, 2);
    expect(top.map((s) => s.score)).toEqual([0.9, 0.9]);
    // Tie break: earlier hour wins
    expect(top[0]!.hour).toBe(12);
    expect(top[1]!.hour).toBe(18);
  });

  it('honours topN limit', () => {
    expect(pickBestTimeSlots(histo, 1)).toHaveLength(1);
  });
});

describe('validateCrossPost', () => {
  it('flags platform-by-platform whether a post fits', () => {
    const longBody = 'hello '.repeat(100) + '#long';
    const checks = validateCrossPost(longBody, ['twitter', 'linkedin']);
    const tw = checks.find((c) => c.platform === 'twitter')!;
    const li = checks.find((c) => c.platform === 'linkedin')!;
    expect(tw.fits).toBe(false);
    expect(tw.charsOver).toBeGreaterThan(0);
    expect(li.fits).toBe(true);
  });

  it('reports hashtag overruns', () => {
    const body = '#a #b #c #d #e #f'; // 6 tags
    const [tw] = validateCrossPost(body, ['twitter']);
    expect(tw!.hashtagsOver).toBe(4); // twitter limit is 2
  });
});
