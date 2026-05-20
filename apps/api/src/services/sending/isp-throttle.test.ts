import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/redis.js', () => ({
  redis: {
    exists: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    decr: vi.fn().mockResolvedValue(499),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

import { detectIsp, checkThrottle, recordThrottleSignal, resetThrottle } from './isp-throttle.js';
import { redis } from '../../lib/redis.js';

describe('detectIsp', () => {
  it('detects gmail', () => {
    expect(detectIsp('gmail.com')).toBe('gmail');
    expect(detectIsp('googlemail.com')).toBe('gmail');
  });

  it('detects microsoft', () => {
    expect(detectIsp('outlook.com')).toBe('microsoft');
    expect(detectIsp('hotmail.com')).toBe('microsoft');
    expect(detectIsp('live.com')).toBe('microsoft');
  });

  it('detects yahoo', () => {
    expect(detectIsp('yahoo.com')).toBe('yahoo');
    expect(detectIsp('aol.com')).toBe('yahoo');
  });

  it('detects seznam (CZ)', () => {
    expect(detectIsp('seznam.cz')).toBe('seznam');
    expect(detectIsp('email.cz')).toBe('seznam');
  });

  it('detects volny (CZ)', () => {
    expect(detectIsp('volny.cz')).toBe('volny');
  });

  it('detects centrum (CZ)', () => {
    expect(detectIsp('centrum.cz')).toBe('centrum');
    expect(detectIsp('post.cz')).toBe('centrum');
  });

  it('returns other for unknown domain', () => {
    expect(detectIsp('firma.com')).toBe('other');
    expect(detectIsp('randomdomain.org')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(detectIsp('Gmail.com')).toBe('gmail');
    expect(detectIsp('OUTLOOK.COM')).toBe('microsoft');
  });
});

describe('checkThrottle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows send when bucket is new (seeds with limit)', async () => {
    (redis.exists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    const result = await checkThrottle('org1', 'gmail.com', '1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.isp).toBe('gmail');
    expect(redis.set).toHaveBeenCalled();
  });

  it('allows send when tokens remain', async () => {
    (redis.exists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
    // effectiveLimit calls redis.get(reducedKey) first, then checkThrottle calls redis.get(tokenKey)
    (redis.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // reducedKey → not reduced
      .mockResolvedValueOnce('100'); // tokenKey → 100 remaining
    const result = await checkThrottle('org1', 'gmail.com', '1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it('blocks send when no tokens remain', async () => {
    (redis.exists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
    (redis.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // reduced check
      .mockResolvedValueOnce('0'); // tokens
    const result = await checkThrottle('org1', 'gmail.com', '1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('applies org-level override', async () => {
    (redis.exists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    const result = await checkThrottle('org1', 'gmail.com', '1.2.3.4', { gmail: 2000 });
    expect(result.allowed).toBe(true);
    // The bucket should be seeded with 1999 (2000 - 1)
    const setCall = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(setCall[1]).toBe(1999);
  });
});

describe('recordThrottleSignal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets the reduced key with 30-minute TTL', async () => {
    await recordThrottleSignal('org1', 'gmail', '1.2.3.4');
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('reduced'), '1', 'EX', 30 * 60);
  });
});

describe('resetThrottle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes all throttle keys for ISP+IP', async () => {
    await resetThrottle('org1', 'gmail', '1.2.3.4');
    expect(redis.del).toHaveBeenCalledOnce();
    const keys = (redis.del as ReturnType<typeof vi.fn>).mock.calls[0] as string[];
    expect(keys.length).toBe(3);
    expect(keys.some((k) => k.includes('tokens'))).toBe(true);
    expect(keys.some((k) => k.includes('reduced'))).toBe(true);
  });
});
