import { describe, it, expect } from 'vitest';
import {
  buildTikTokPayload,
  buildTikTokRows,
  chunkTikTok,
  computeTikTokStats,
  hashEmailForTikTok,
  hashPhoneForTikTok,
  validateTikTokAudienceName,
} from './pure.js';

describe('hashEmailForTikTok', () => {
  it('lowercases + trims + hashes', () => {
    expect(hashEmailForTikTok('Foo@Bar.com')).toBe(hashEmailForTikTok('foo@bar.com'));
  });
});

describe('hashPhoneForTikTok', () => {
  it('canonicalises to +E.164 then hashes', () => {
    expect(hashPhoneForTikTok('+420777111222')).toBe(hashPhoneForTikTok('00420777111222'));
  });
  it('rejects too-short (under 8 digits)', () => {
    expect(hashPhoneForTikTok('+1234567')).toBe('');
    expect(hashPhoneForTikTok('1234567')).toBe('');
  });
});

describe('validateTikTokAudienceName', () => {
  it('returns trimmed', () => {
    expect(validateTikTokAudienceName('  hi  ')).toBe('hi');
  });
  it('throws empty', () => {
    expect(() => validateTikTokAudienceName('')).toThrow();
  });
  it('throws too long', () => {
    expect(() => validateTikTokAudienceName('x'.repeat(101))).toThrow();
  });
});

describe('buildTikTokRows', () => {
  it('emits one row per identifier', () => {
    const rows = buildTikTokRows([
      { email: 'a@x.com', phone: '+420777111222' },
      { email: 'b@x.com' },
    ]);
    expect(rows.length).toBe(3);
    expect(rows.filter((r) => r.id_type === 'EMAIL_SHA256').length).toBe(2);
    expect(rows.filter((r) => r.id_type === 'PHONE_SHA256').length).toBe(1);
  });

  it('skips invalid rows', () => {
    expect(buildTikTokRows([{ email: '', phone: 'short' }])).toEqual([]);
  });
});

describe('buildTikTokPayload', () => {
  it('combines name + rows', () => {
    const p = buildTikTokPayload('My Audience', [{ email: 'a@x.com' }]);
    expect(p.custom_audience_name).toBe('My Audience');
    expect(p.data.length).toBe(1);
  });
});

describe('chunkTikTok', () => {
  it('uses 100K default', () => {
    const arr = Array.from({ length: 250_000 }, (_, i) => i);
    const batches = chunkTikTok(arr);
    expect(batches.length).toBe(3);
    expect(batches[0]!.length).toBe(100_000);
  });

  it('respects custom size', () => {
    const arr = Array.from({ length: 5 }, (_, i) => i);
    expect(chunkTikTok(arr, 2).length).toBe(3);
  });
});

describe('computeTikTokStats', () => {
  it('counts hashed rows + batches', () => {
    const stats = computeTikTokStats([
      { email: 'a@x.com', phone: '+420777111222' },
      { email: 'b@x.com' },
    ]);
    expect(stats.totalMembers).toBe(2);
    expect(stats.hashedRows).toBe(3); // 2 emails + 1 phone
    expect(stats.batches).toBe(1);
  });
});
