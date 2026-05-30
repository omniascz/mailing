import { describe, it, expect } from 'vitest';
import {
  buildGoogleOperations,
  buildGoogleUserIdentifiers,
  chunkGoogle,
  computeGoogleStats,
  hashEmailForGoogle,
  hashPhoneForGoogle,
  normaliseEmailForGoogle,
} from './pure.js';

describe('normaliseEmailForGoogle', () => {
  it('lowercases + trims', () => {
    expect(normaliseEmailForGoogle('  Foo@Example.com  ')).toBe('foo@example.com');
  });
  it('strips dots from gmail local part', () => {
    expect(normaliseEmailForGoogle('john.doe@gmail.com')).toBe('johndoe@gmail.com');
  });
  it('keeps dots for non-gmail domains', () => {
    expect(normaliseEmailForGoogle('john.doe@example.com')).toBe('john.doe@example.com');
  });
  it('also normalises googlemail.com', () => {
    expect(normaliseEmailForGoogle('a.b@googlemail.com')).toBe('ab@googlemail.com');
  });
  it('returns empty for malformed', () => {
    expect(normaliseEmailForGoogle('notanemail')).toBe('');
  });
});

describe('hashEmailForGoogle', () => {
  it('produces stable SHA-256', () => {
    const a = hashEmailForGoogle('A@example.com');
    const b = hashEmailForGoogle('a@example.com');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
  it('treats gmail dots as equivalent', () => {
    expect(hashEmailForGoogle('a.b@gmail.com')).toBe(hashEmailForGoogle('ab@gmail.com'));
  });
});

describe('hashPhoneForGoogle', () => {
  it('canonicalises to +E.164', () => {
    const a = hashPhoneForGoogle('+420777123456');
    const b = hashPhoneForGoogle('00420777123456');
    expect(a).toBe(b);
  });
  it('rejects too-short (under 8 digits)', () => {
    expect(hashPhoneForGoogle('+1234567')).toBe('');
    expect(hashPhoneForGoogle('1234567')).toBe('');
  });
  it('rejects alpha + invalid characters', () => {
    expect(hashPhoneForGoogle('+abc123')).toBe('');
  });
});

describe('buildGoogleUserIdentifiers', () => {
  it('emits one identifier per signal', () => {
    const ids = buildGoogleUserIdentifiers({
      email: 'a@x.com',
      phone: '+420777111222',
    });
    expect(ids.length).toBe(2);
    expect(ids[0]).toHaveProperty('hashedEmail');
    expect(ids[1]).toHaveProperty('hashedPhoneNumber');
  });

  it('emits addressInfo only when fully populated', () => {
    const ids = buildGoogleUserIdentifiers({
      firstName: 'Petr',
      lastName: 'Nový',
      countryCode: 'CZ',
      zip: '12000',
    });
    expect(ids.length).toBe(1);
    expect(ids[0]?.addressInfo?.countryCode).toBe('CZ');
  });

  it('skips addressInfo when zip missing', () => {
    const ids = buildGoogleUserIdentifiers({
      firstName: 'P',
      lastName: 'N',
      countryCode: 'CZ',
    });
    expect(ids).toEqual([]);
  });

  it('skips empty signals', () => {
    expect(buildGoogleUserIdentifiers({})).toEqual([]);
  });
});

describe('buildGoogleOperations', () => {
  it('one operation per member with at least one identifier', () => {
    const ops = buildGoogleOperations([
      { email: 'a@x.com' },
      { phone: '+420777111222' },
      { email: '', phone: '' },
    ]);
    expect(ops.length).toBe(2);
    expect(ops[0]!.create.userIdentifiers.length).toBeGreaterThan(0);
  });
});

describe('chunkGoogle', () => {
  it('splits at 10K default', () => {
    const ops = chunkGoogle(Array.from({ length: 25_000 }, (_, i) => i));
    expect(ops.length).toBe(3);
  });
});

describe('computeGoogleStats', () => {
  it('counts operations + batches', () => {
    const stats = computeGoogleStats([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
    expect(stats.totalMembers).toBe(2);
    expect(stats.operations).toBe(2);
    expect(stats.batches).toBe(1);
  });
});
