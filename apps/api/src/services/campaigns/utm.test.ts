/**
 * UTM values and the preview, against the inputs this market actually supplies.
 *
 * The interesting cases are all about a value crossing a boundary: a Czech
 * campaign name into a URL, a URL that already has a query string, a name that
 * slugs to nothing at all.
 */
import { describe, it, expect } from 'vitest';
import {
  slugify,
  defaultUtmFor,
  resolveUtm,
  previewTaggedUrl,
  DEFAULT_SOURCE,
  DEFAULT_MEDIUM,
} from './utm.js';

const campaign = (name: string, id = '11111111-2222-3333-4444-555555555555') =>
  ({ id, name }) as never;

describe('slugify', () => {
  it('folds Czech diacritics rather than dropping the letters', () => {
    // The failure this guards: a naive [^a-z0-9] filter turns "Vánoční" into
    // "vnon", which is unreadable in a GA report.
    expect(slugify('Vánoční sleva 2026')).toBe('vanocni-sleva-2026');
    expect(slugify('Příliš žluťoučký kůň')).toBe('prilis-zlutoucky-kun');
    expect(slugify('Ľúbozvučnosť')).toBe('lubozvucnost');
  });

  it('produces a value that needs no URL encoding', () => {
    const slug = slugify('Vánoční sleva 2026 — 50 % na vše!');
    expect(encodeURIComponent(slug)).toBe(slug);
    expect(slug).not.toMatch(/[\s?#&=%]/);
  });

  it('collapses punctuation and trims the edges', () => {
    expect(slugify('  Black   Friday!!! ')).toBe('black-friday');
    expect(slugify('a//b__c')).toBe('a-b-c');
  });

  it('bounds the length without leaving a trailing hyphen', () => {
    const out = slugify('slovo '.repeat(40), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('-')).toBe(false);
  });

  it('returns empty for a name with nothing sluggable in it', () => {
    expect(slugify('🎄🎁')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('defaults', () => {
  it('name the campaign by its name, not its id', () => {
    expect(defaultUtmFor(campaign('Vánoční sleva 2026'))).toEqual({
      source: DEFAULT_SOURCE,
      medium: DEFAULT_MEDIUM,
      campaign: 'vanocni-sleva-2026',
    });
  });

  it('fall back to the id when the name slugs to nothing', () => {
    // An ugly utm_campaign beats an empty one: an empty value groups every
    // such campaign together in the report.
    const d = defaultUtmFor(campaign('🎄'));
    expect(d.campaign).toBe('11111111-2222-3333-4444-555555555555');
  });
});

describe('resolveUtm', () => {
  it('fills the gaps and leaves what was set alone', () => {
    const out = resolveUtm(campaign('Vánoce'), { enabled: true, medium: 'promo' });
    expect(out).toMatchObject({
      enabled: true,
      source: 'email',
      medium: 'promo',
      campaign: 'vanoce',
    });
  });

  it('treats blank strings as unset rather than as a value', () => {
    const out = resolveUtm(campaign('Vánoce'), { enabled: true, source: '   ', campaign: '' });
    expect(out.source).toBe('email');
    expect(out.campaign).toBe('vanoce');
  });

  it('omits content and term entirely when they are not set', () => {
    const out = resolveUtm(campaign('x'), { enabled: true });
    expect(out).not.toHaveProperty('content');
    expect(out).not.toHaveProperty('term');
  });

  it('is off unless something says otherwise', () => {
    expect(resolveUtm(campaign('x'), null).enabled).toBe(false);
    expect(resolveUtm(campaign('x'), undefined).enabled).toBe(false);
  });
});

describe('previewTaggedUrl', () => {
  const utm = { enabled: true, source: 'email', medium: 'newsletter', campaign: 'vanoce' };

  it('appends to a bare URL', () => {
    expect(previewTaggedUrl('https://shop.test/produkt', utm)).toBe(
      'https://shop.test/produkt?utm_source=email&utm_medium=newsletter&utm_campaign=vanoce',
    );
  });

  it('extends an existing query string instead of starting a second one', () => {
    const out = previewTaggedUrl('https://shop.test/p?id=7&ref=xmas', utm);
    expect(out.match(/\?/g), 'more than one ? in the URL').toHaveLength(1);
    expect(out).toContain('id=7');
    expect(out).toContain('ref=xmas');
    expect(out).toContain('utm_campaign=vanoce');
  });

  it('does not overwrite a UTM the link already carries', () => {
    // First writer wins: a link the customer tagged by hand means it.
    const out = previewTaggedUrl('https://shop.test/p?utm_source=partner', utm);
    expect(out).toContain('utm_source=partner');
    expect(out).not.toContain('utm_source=email');
  });

  it('keeps the fragment where it belongs, after the query', () => {
    const out = previewTaggedUrl('https://shop.test/p#detail', utm);
    expect(out).toBe(
      'https://shop.test/p?utm_source=email&utm_medium=newsletter&utm_campaign=vanoce#detail',
    );
  });

  it('leaves the URL alone when tagging is off', () => {
    expect(previewTaggedUrl('https://shop.test/p?id=7', { ...utm, enabled: false })).toBe(
      'https://shop.test/p?id=7',
    );
  });

  it('returns an unparseable input unchanged rather than throwing', () => {
    expect(previewTaggedUrl('not a url', utm)).toBe('not a url');
  });
});
