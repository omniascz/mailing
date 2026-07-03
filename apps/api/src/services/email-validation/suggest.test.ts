import { describe, it, expect } from 'vitest';
import { suggestEmailCorrection, levenshtein } from './suggest.js';

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('gmail', 'gmial')).toBe(2);
    expect(levenshtein('com', 'con')).toBe(1);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
});

describe('suggestEmailCorrection', () => {
  it('fixes a transposed SLD typo', () => {
    expect(suggestEmailCorrection('user@gmial.com')).toBe('user@gmail.com');
    expect(suggestEmailCorrection('jan@hotmial.com')).toBe('jan@hotmail.com');
  });

  it('fixes a mistyped TLD', () => {
    expect(suggestEmailCorrection('firma@example.con')).toBe('firma@example.com');
    expect(suggestEmailCorrection('petr@seznam.c')).toBe('petr@seznam.cz');
  });

  it('returns null for an already-valid popular domain', () => {
    expect(suggestEmailCorrection('user@gmail.com')).toBeNull();
    expect(suggestEmailCorrection('petr@seznam.cz')).toBeNull();
  });

  it('returns null when nothing is close', () => {
    expect(suggestEmailCorrection('user@my-own-company.io')).toBeNull();
  });

  it('never rewrites the local part', () => {
    expect(suggestEmailCorrection('First.Last+tag@gmial.com')).toBe('First.Last+tag@gmail.com');
  });

  it('handles malformed input safely', () => {
    expect(suggestEmailCorrection('not-an-email')).toBeNull();
    expect(suggestEmailCorrection('@gmail.com')).toBeNull();
    expect(suggestEmailCorrection('user@')).toBeNull();
    // @ts-expect-error invalid input
    expect(suggestEmailCorrection(null)).toBeNull();
  });
});
