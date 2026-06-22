import { describe, it, expect } from 'vitest';
import { slugify } from './provision.js';

describe('slugify (partner org slug)', () => {
  it('lowercases, strips diacritics, hyphenates', () => {
    expect(slugify('Národní divadlo')).toBe('narodni-divadlo');
    expect(slugify('Divadlo Na Zábradlí')).toBe('divadlo-na-zabradli');
  });

  it('collapses junk and trims edges', () => {
    expect(slugify('  Foo & Bar!!  ')).toBe('foo-bar');
    expect(slugify('A---B')).toBe('a-b');
  });

  it('falls back to "org" for empty/symbol-only', () => {
    expect(slugify('')).toBe('org');
    expect(slugify('!!!')).toBe('org');
  });

  it('caps length at 80', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
