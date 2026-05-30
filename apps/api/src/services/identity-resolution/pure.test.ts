import { describe, it, expect } from 'vitest';
import {
  buildAdjacency,
  buildFingerprint,
  buildScreenSig,
  classifyProbabilistic,
  conflictLevel,
  decayConfidence,
  extractLocale,
  fingerprintSimilarity,
  ipToPrefix,
  isIdentifying,
  shortHash,
  transitiveClosure,
} from './pure.js';

describe('buildAdjacency', () => {
  it('connects contacts sharing a signal', () => {
    const adj = buildAdjacency([
      { contactId: 'c1', signalKey: 'email:a@x.com' },
      { contactId: 'c2', signalKey: 'email:a@x.com' },
      { contactId: 'c3', signalKey: 'phone:+420' },
    ]);
    expect(adj.get('c1')?.has('c2')).toBe(true);
    expect(adj.get('c2')?.has('c1')).toBe(true);
    expect(adj.has('c3')).toBe(false); // alone, no edge
  });

  it('returns empty for empty input', () => {
    expect(buildAdjacency([]).size).toBe(0);
  });

  it('chained signals build A↔B and B↔C without direct A↔C', () => {
    const adj = buildAdjacency([
      { contactId: 'a', signalKey: 'email:x' },
      { contactId: 'b', signalKey: 'email:x' },
      { contactId: 'b', signalKey: 'phone:y' },
      { contactId: 'c', signalKey: 'phone:y' },
    ]);
    expect(adj.get('a')?.has('b')).toBe(true);
    expect(adj.get('b')?.has('c')).toBe(true);
    expect(adj.get('a')?.has('c')).toBeFalsy();
  });
});

describe('transitiveClosure', () => {
  it('returns root alone when isolated', () => {
    expect(transitiveClosure('root', new Map()).size).toBe(1);
  });

  it('walks A→B→C in two hops', () => {
    const adj = buildAdjacency([
      { contactId: 'a', signalKey: 'e:1' },
      { contactId: 'b', signalKey: 'e:1' },
      { contactId: 'b', signalKey: 'p:1' },
      { contactId: 'c', signalKey: 'p:1' },
    ]);
    const closure = transitiveClosure('a', adj);
    expect(closure.has('a')).toBe(true);
    expect(closure.has('b')).toBe(true);
    expect(closure.has('c')).toBe(true);
  });

  it('respects maxHops cap', () => {
    const adj = buildAdjacency([
      { contactId: 'a', signalKey: 's1' },
      { contactId: 'b', signalKey: 's1' },
      { contactId: 'b', signalKey: 's2' },
      { contactId: 'c', signalKey: 's2' },
      { contactId: 'c', signalKey: 's3' },
      { contactId: 'd', signalKey: 's3' },
    ]);
    const closure = transitiveClosure('a', adj, 1);
    expect(closure.has('b')).toBe(true);
    expect(closure.has('c')).toBe(false);
  });
});

describe('conflictLevel', () => {
  it('0 for single contact', () => {
    expect(conflictLevel(1)).toBe(0);
  });
  it('1 for 2 contacts', () => {
    expect(conflictLevel(2)).toBe(1);
  });
  it('2 for 3-4 contacts', () => {
    expect(conflictLevel(3)).toBe(2);
    expect(conflictLevel(4)).toBe(2);
  });
  it('3 for 5-9 contacts', () => {
    expect(conflictLevel(5)).toBe(3);
    expect(conflictLevel(9)).toBe(3);
  });
  it('4 for 10+ contacts (quarantine)', () => {
    expect(conflictLevel(10)).toBe(4);
    expect(conflictLevel(50)).toBe(4);
  });
});

describe('isIdentifying', () => {
  it('true at level 0-2', () => {
    expect(isIdentifying(0)).toBe(true);
    expect(isIdentifying(1)).toBe(true);
    expect(isIdentifying(2)).toBe(true);
  });
  it('false at level 3-4', () => {
    expect(isIdentifying(3)).toBe(false);
    expect(isIdentifying(4)).toBe(false);
  });
});

describe('decayConfidence', () => {
  it('returns stored value at age 0', () => {
    expect(decayConfidence(80, 0)).toBe(80);
  });
  it('returns stored value for negative age (defensive)', () => {
    expect(decayConfidence(80, -5)).toBe(80);
  });
  it('halves at 90-day half-life', () => {
    expect(decayConfidence(80, 90)).toBe(40);
  });
  it('quarters at 180 days', () => {
    expect(decayConfidence(80, 180)).toBe(20);
  });
});

describe('ipToPrefix', () => {
  it('IPv4 → /24 string', () => {
    expect(ipToPrefix('192.0.2.34')).toBe('192.0.2');
  });
  it('IPv6 → first three groups', () => {
    expect(ipToPrefix('2001:db8:abcd::1')).toBe('2001:db8:abcd');
  });
  it('null for invalid', () => {
    expect(ipToPrefix('not an ip')).toBeNull();
    expect(ipToPrefix('')).toBeNull();
    expect(ipToPrefix(null)).toBeNull();
  });
});

describe('shortHash', () => {
  it('returns 32-hex-char string', () => {
    const h = shortHash('hello world')!;
    expect(h).toMatch(/^[a-f0-9]{32}$/);
  });
  it('null for empty', () => {
    expect(shortHash(null)).toBeNull();
    expect(shortHash('  ')).toBeNull();
  });
  it('stable across calls', () => {
    expect(shortHash('x')).toBe(shortHash('x'));
  });
});

describe('buildScreenSig', () => {
  it('formats with default dpr=1', () => {
    expect(buildScreenSig({ width: 1920, height: 1080 })).toBe('1920x1080@1');
  });
  it('rounds size to nearest 10', () => {
    expect(buildScreenSig({ width: 1921, height: 1081 })).toBe('1920x1080@1');
  });
  it('preserves dpr', () => {
    expect(buildScreenSig({ width: 800, height: 600, dpr: 2 })).toBe('800x600@2');
  });
  it('null when width or height missing', () => {
    expect(buildScreenSig({ width: 1920 })).toBeNull();
    expect(buildScreenSig({ height: 1080 })).toBeNull();
  });
});

describe('extractLocale', () => {
  it('first locale tag from Accept-Language', () => {
    expect(extractLocale('en-US,en;q=0.9,cs;q=0.8')).toBe('en-US');
  });
  it('handles single tag', () => {
    expect(extractLocale('cs')).toBe('cs');
  });
  it('null for missing or malformed', () => {
    expect(extractLocale(null)).toBeNull();
    expect(extractLocale('garbage123!')).toBeNull();
  });
});

describe('fingerprintSimilarity', () => {
  const fp = {
    ipPrefix: '192.0.2',
    userAgentHash: 'abc',
    acceptLanguageHash: 'def',
    locale: 'cs-CZ',
    screenSig: '1920x1080@1',
  };

  it('1.0 for identical fingerprints', () => {
    expect(fingerprintSimilarity(fp, fp)).toBe(1);
  });

  it('0 for completely different', () => {
    const other = {
      ipPrefix: '10.0.0',
      userAgentHash: 'xxx',
      acceptLanguageHash: 'yyy',
      locale: 'en-GB',
      screenSig: '800x600@2',
    };
    expect(fingerprintSimilarity(fp, other)).toBe(0);
  });

  it('matches partial — same IP + UA only', () => {
    const partial = {
      ipPrefix: '192.0.2',
      userAgentHash: 'abc',
      acceptLanguageHash: 'YYY',
      locale: 'en-GB',
      screenSig: '800x600@2',
    };
    const s = fingerprintSimilarity(fp, partial);
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });

  it('skips missing fields and normalises', () => {
    const sparse = {
      ipPrefix: '192.0.2',
      userAgentHash: 'abc',
      acceptLanguageHash: null,
      locale: null,
      screenSig: null,
    };
    expect(fingerprintSimilarity(fp, sparse)).toBe(1); // present fields all match
  });

  it('0 when no overlapping fields are populated', () => {
    expect(
      fingerprintSimilarity(
        { ipPrefix: '1.1.1', userAgentHash: null, acceptLanguageHash: null, locale: null, screenSig: null },
        { ipPrefix: null, userAgentHash: 'abc', acceptLanguageHash: null, locale: null, screenSig: null },
      ),
    ).toBe(0);
  });
});

describe('classifyProbabilistic', () => {
  it('no_match below 0.5', () => {
    expect(classifyProbabilistic(0.49)).toBe('no_match');
  });
  it('low 0.5-0.7', () => {
    expect(classifyProbabilistic(0.5)).toBe('low');
    expect(classifyProbabilistic(0.69)).toBe('low');
  });
  it('suggest 0.7-0.85', () => {
    expect(classifyProbabilistic(0.7)).toBe('suggest');
    expect(classifyProbabilistic(0.84)).toBe('suggest');
  });
  it('auto at 0.85+', () => {
    expect(classifyProbabilistic(0.85)).toBe('auto');
    expect(classifyProbabilistic(1.0)).toBe('auto');
  });
});

describe('buildFingerprint integration', () => {
  it('composes a full fingerprint from raw request data', () => {
    const fp = buildFingerprint({
      ip: '192.0.2.34',
      userAgent: 'Mozilla/5.0',
      acceptLanguage: 'cs-CZ,cs;q=0.9',
      width: 1920,
      height: 1080,
      dpr: 1,
    });
    expect(fp.ipPrefix).toBe('192.0.2');
    expect(fp.userAgentHash).toMatch(/^[a-f0-9]{32}$/);
    expect(fp.acceptLanguageHash).toMatch(/^[a-f0-9]{32}$/);
    expect(fp.locale).toBe('cs-CZ');
    expect(fp.screenSig).toBe('1920x1080@1');
  });

  it('handles sparse input gracefully', () => {
    const fp = buildFingerprint({});
    expect(fp).toEqual({
      ipPrefix: null,
      userAgentHash: null,
      acceptLanguageHash: null,
      locale: null,
      screenSig: null,
    });
  });
});
