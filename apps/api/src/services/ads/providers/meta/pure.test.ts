import { describe, it, expect } from 'vitest';
import {
  buildMetaPayload,
  chunkMeta,
  computeMetaStats,
  hashEmailForMeta,
  hashNameForMeta,
  hashPhoneForMeta,
  normaliseCountryForMeta,
  validateMetaAudienceName,
} from './pure.js';

describe('hashEmailForMeta', () => {
  it('lowercases + trims + hashes', () => {
    const a = hashEmailForMeta('  Test@Example.COM  ');
    const b = hashEmailForMeta('test@example.com');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
  it('empty for blank input', () => {
    expect(hashEmailForMeta('   ')).toBe('');
  });
});

describe('hashPhoneForMeta', () => {
  it('strips +/00 and hashes E.164 digits', () => {
    const a = hashPhoneForMeta('+420 777 123 456');
    const b = hashPhoneForMeta('00420777123456');
    const c = hashPhoneForMeta('420777123456');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it('rejects too-short or non-digit', () => {
    expect(hashPhoneForMeta('1234')).toBe('');
    expect(hashPhoneForMeta('not a phone')).toBe('');
  });
});

describe('hashNameForMeta', () => {
  it('handles diacritics', () => {
    expect(hashNameForMeta('Žofie')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('empty for blank', () => {
    expect(hashNameForMeta('123!')).toBe('');
  });
});

describe('normaliseCountryForMeta', () => {
  it('lowercases 2-letter ISO', () => {
    expect(normaliseCountryForMeta('CZ')).toBe('cz');
  });
  it('empty for invalid', () => {
    expect(normaliseCountryForMeta('CZE')).toBe('');
    expect(normaliseCountryForMeta('XX1')).toBe('');
  });
});

describe('validateMetaAudienceName', () => {
  it('returns trimmed name when valid', () => {
    expect(validateMetaAudienceName('  hello  ')).toBe('hello');
  });
  it('throws on empty', () => {
    expect(() => validateMetaAudienceName('  ')).toThrow();
  });
  it('throws on too long', () => {
    expect(() => validateMetaAudienceName('x'.repeat(51))).toThrow();
  });
});

describe('buildMetaPayload', () => {
  it('emits EMAIL+PHONE schema for email-only list', () => {
    const p = buildMetaPayload([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
    expect(p.schema).toEqual(['EMAIL_SHA256', 'PHONE_SHA256']);
    expect(p.data.length).toBe(2);
    expect(p.data[0]![1]).toBe(''); // empty phone slot
  });

  it('appends FN/LN when names supplied', () => {
    const p = buildMetaPayload([{ email: 'a@x.com', firstName: 'Petr', lastName: 'Nový' }]);
    expect(p.schema).toContain('FN_SHA256');
    expect(p.schema).toContain('LN_SHA256');
    expect(p.data[0]!.length).toBe(p.schema.length);
  });

  it('skips rows with all empty cells', () => {
    const p = buildMetaPayload([{ email: '', phone: '' }, { email: 'a@x.com' }]);
    expect(p.data.length).toBe(1);
  });

  it('adds COUNTRY column unhashed', () => {
    const p = buildMetaPayload([{ email: 'a@x.com', countryCode: 'CZ' }]);
    const idx = p.schema.indexOf('COUNTRY');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(p.data[0]![idx]).toBe('cz');
  });
});

describe('chunkMeta', () => {
  it('splits at 10K default', () => {
    const arr = Array.from({ length: 25_000 }, (_, i) => i);
    const out = chunkMeta(arr);
    expect(out.length).toBe(3);
    expect(out[0]!.length).toBe(10_000);
    expect(out[2]!.length).toBe(5_000);
  });

  it('throws on non-positive size', () => {
    expect(() => chunkMeta([1, 2], 0)).toThrow();
  });

  it('empty input → empty array', () => {
    expect(chunkMeta([])).toEqual([]);
  });
});

describe('computeMetaStats', () => {
  it('reports total + hashed + batches', () => {
    const stats = computeMetaStats([
      { email: 'a@x.com' },
      { email: 'b@x.com' },
      { email: '', phone: '' },
    ]);
    expect(stats.totalMembers).toBe(3);
    expect(stats.hashedRows).toBe(2);
    expect(stats.batches).toBe(1);
  });

  it('zero batches when nothing hashable', () => {
    expect(computeMetaStats([{ email: '', phone: '' }]).batches).toBe(0);
  });
});
