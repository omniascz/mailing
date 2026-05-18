import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  hashEmailForAudience,
  hashPhoneForAudience,
  formatAudienceRow,
  buildUtmUrl,
  computeAdPerformance,
  attributeConversion,
  type ClickEvent,
} from './pure.js';

describe('hashEmailForAudience', () => {
  it('lowercases and trims before SHA-256', () => {
    const expected = createHash('sha256').update('petr@example.cz').digest('hex');
    expect(hashEmailForAudience('  Petr@Example.cz ')).toBe(expected);
  });
});

describe('hashPhoneForAudience', () => {
  it('strips non-digit chars then hashes', () => {
    const expected = createHash('sha256').update('420777123456').digest('hex');
    expect(hashPhoneForAudience('+420 777 123 456')).toBe(expected);
  });
});

describe('formatAudienceRow', () => {
  it('returns 4 columns with stable order', () => {
    const row = formatAudienceRow({ email: 'a@b.cz', firstName: 'Petr' });
    expect(row).toHaveLength(4);
    expect(row[0]).toBe(hashEmailForAudience('a@b.cz'));
    expect(row[1]).toBe(''); // no phone
    expect(row[2]).toBe(createHash('sha256').update('petr').digest('hex'));
    expect(row[3]).toBe(''); // no last
  });

  it('returns all blanks for empty input', () => {
    expect(formatAudienceRow({})).toEqual(['', '', '', '']);
  });
});

describe('buildUtmUrl', () => {
  it('appends full UTM set', () => {
    const out = buildUtmUrl('https://example.cz/pricing', {
      source: 'google',
      medium: 'cpc',
      campaign: 'spring_2026',
    });
    expect(out).toContain('utm_source=google');
    expect(out).toContain('utm_medium=cpc');
    expect(out).toContain('utm_campaign=spring_2026');
  });

  it('preserves existing query params', () => {
    const out = buildUtmUrl('https://example.cz/p?id=42', {
      source: 'fb',
      medium: 'social',
      campaign: 'launch',
    });
    expect(out).toContain('id=42');
  });

  it('overwrites existing UTM keys', () => {
    const out = buildUtmUrl(
      'https://example.cz/p?utm_source=old',
      { source: 'new', medium: 'cpc', campaign: 'x' },
    );
    expect(out).toContain('utm_source=new');
    expect(out).not.toContain('utm_source=old');
  });

  it('returns null for malformed URL', () => {
    expect(buildUtmUrl('not a url', { source: 's', medium: 'm', campaign: 'c' })).toBeNull();
  });
});

describe('computeAdPerformance', () => {
  it('computes CTR, CPC, CPA, ROAS', () => {
    const m = computeAdPerformance({
      impressions: 10_000,
      clicks: 300,
      conversions: 30,
      cost: 600,
      revenue: 3000,
    });
    expect(m.ctr).toBeCloseTo(0.03, 4);
    expect(m.cvr).toBeCloseTo(0.1, 4);
    expect(m.cpc).toBe(2);
    expect(m.cpa).toBe(20);
    expect(m.roas).toBe(5);
    expect(m.profit).toBe(2400);
  });

  it('handles zero impressions gracefully', () => {
    const m = computeAdPerformance({
      impressions: 0, clicks: 0, conversions: 0, cost: 0, revenue: 0,
    });
    expect(m.ctr).toBe(0);
    expect(m.cpc).toBe(0);
    expect(m.roas).toBe(0);
  });
});

describe('attributeConversion', () => {
  const now = new Date('2026-04-24T12:00:00Z');
  const mk = (daysAgo: number, source: string, campaign = 'c1'): ClickEvent => ({
    ts: new Date(now.getTime() - daysAgo * 86_400_000),
    source,
    campaign,
  });

  it('picks most recent in-window click', () => {
    const click = attributeConversion(
      { ts: now, value: 100 },
      [mk(20, 'google'), mk(3, 'facebook'), mk(10, 'linkedin')],
    );
    expect(click?.source).toBe('facebook');
  });

  it('skips direct source', () => {
    const click = attributeConversion(
      { ts: now, value: 100 },
      [mk(1, 'direct'), mk(5, 'google')],
    );
    expect(click?.source).toBe('google');
  });

  it('respects lookback window', () => {
    const click = attributeConversion(
      { ts: now, value: 100 },
      [mk(60, 'google')],
      30,
    );
    expect(click).toBeNull();
  });

  it('ignores clicks after conversion time', () => {
    const future: ClickEvent = {
      ts: new Date(now.getTime() + 86_400_000),
      source: 'google',
      campaign: 'c1',
    };
    expect(attributeConversion({ ts: now, value: 100 }, [future])).toBeNull();
  });
});
