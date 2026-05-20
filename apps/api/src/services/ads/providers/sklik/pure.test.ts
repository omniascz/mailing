import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  hashEmailForSklik,
  hashPhoneForSklik,
  buildAudiencePayload,
  chunk,
  computeStats,
  SKLIK_BATCH_SIZE,
} from './pure.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('hashEmailForSklik', () => {
  it('lowercases + trims before hashing', () => {
    expect(hashEmailForSklik('  Jane@Example.COM ')).toBe(sha256('jane@example.com'));
  });

  it('returns empty string for empty input', () => {
    expect(hashEmailForSklik('')).toBe('');
    expect(hashEmailForSklik('   ')).toBe('');
  });

  it('produces a 64-char hex digest', () => {
    expect(hashEmailForSklik('a@b.com')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('hashPhoneForSklik', () => {
  it('strips formatting and hashes E.164 digits', () => {
    expect(hashPhoneForSklik('+420 123 456 789')).toBe(sha256('420123456789'));
    expect(hashPhoneForSklik('+420-123-456-789')).toBe(sha256('420123456789'));
  });

  it('drops a leading 00 international prefix', () => {
    expect(hashPhoneForSklik('00420123456789')).toBe(sha256('420123456789'));
  });

  it('returns empty for too-short / too-long', () => {
    expect(hashPhoneForSklik('+12345')).toBe('');
    expect(hashPhoneForSklik('+1234567890123456')).toBe('');
  });

  it('returns empty for non-numeric', () => {
    expect(hashPhoneForSklik('abc')).toBe('');
  });
});

describe('buildAudiencePayload', () => {
  it('includes both email and phone hashes when present', () => {
    const out = buildAudiencePayload('Acme audience', [
      { email: 'a@b.com', phone: '+420123456789' },
    ]);
    expect(out.name).toBe('Acme audience');
    expect(out.customer_data).toHaveLength(1);
    expect(out.customer_data[0]?.email_sha256).toBe(sha256('a@b.com'));
    expect(out.customer_data[0]?.phone_sha256).toBe(sha256('420123456789'));
  });

  it('skips members with neither usable email nor phone', () => {
    const out = buildAudiencePayload('Aud', [
      { email: '', phone: '' },
      { email: 'a@b.com', phone: null },
      { email: 'invalid', phone: 'invalid-phone' },
    ]);
    // 'invalid' is still a string — empty `@` check is up to the caller; SHA-256 still produced.
    // But invalid-phone fails normalisation → no phone hash; 'invalid' email is hashed verbatim.
    expect(out.customer_data.some((r) => r.email_sha256 === sha256('a@b.com'))).toBe(true);
  });

  it('rejects empty audience name', () => {
    expect(() => buildAudiencePayload('   ', [])).toThrow(/required/i);
  });

  it('rejects audience name over 64 chars', () => {
    expect(() => buildAudiencePayload('x'.repeat(65), [])).toThrow(/64/);
  });
});

describe('chunk', () => {
  it('splits into batches of ≤ size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns [] for empty array', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('throws on non-positive size', () => {
    expect(() => chunk([1, 2], 0)).toThrow(/positive/);
    expect(() => chunk([1, 2], -1)).toThrow(/positive/);
  });

  it('uses the default Sklik batch size when none given', () => {
    const arr = new Array(SKLIK_BATCH_SIZE + 1).fill(0);
    expect(chunk(arr).length).toBe(2);
  });
});

describe('computeStats', () => {
  it('counts only members with at least one usable identifier', () => {
    const stats = computeStats([
      { email: 'a@b.com' },
      { phone: '+420123456789' },
      { email: '', phone: '' },
      { email: 'c@d.com', phone: '+420987654321' },
    ]);
    expect(stats.totalMembers).toBe(4);
    expect(stats.hashedRows).toBe(3);
    expect(stats.batches).toBe(1);
  });

  it('reports the right batch count for large lists', () => {
    const members = new Array(SKLIK_BATCH_SIZE * 2 + 5)
      .fill(0)
      .map((_, i) => ({ email: `u${i}@x.com` }));
    const stats = computeStats(members);
    expect(stats.batches).toBe(3);
  });
});
