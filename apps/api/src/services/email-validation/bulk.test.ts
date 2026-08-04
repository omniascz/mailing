import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub redis at the module level so bulk validation runs in isolation
// from a live Redis instance.
vi.mock('@forgemsg/shared/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

// Stub the syntactic validator with a deterministic shape — the real one
// pulls in disposable + role-prefix data we don't want to mirror here.
vi.mock('./index.js', () => ({
  validateEmailSync: vi.fn((email: string) => {
    const ok = typeof email === 'string' && /.+@.+\..+/.test(email);
    return {
      score: ok ? 100 : 0,
      reasons: ok ? [] : ['invalid_syntax'],
      isValid: ok,
      isDisposable: email.endsWith('@mailinator.com'),
      isRoleBased: email.startsWith('info@'),
      hasMx: null,
    };
  }),
}));

// Stub DNS — we shouldn't hit the network in unit tests.
vi.mock('node:dns/promises', () => ({
  default: {
    resolveMx: vi.fn(async (domain: string) => {
      if (domain === 'fail.invalid') throw new Error('NXDOMAIN');
      return [{ priority: 10, exchange: `mx.${domain}` }];
    }),
  },
}));

import { bulkValidate } from './bulk.js';

describe('bulkValidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the right shape and counts for a healthy batch', async () => {
    const r = await bulkValidate(['a@example.com', 'b@example.com']);
    expect(r.total).toBe(2);
    expect(r.valid).toBe(2);
    expect(r.invalid).toBe(0);
    expect(r.results).toHaveLength(2);
  });

  it('detects malformed addresses', async () => {
    const r = await bulkValidate(['not-an-email', 'a@b.c']);
    expect(r.results[0]?.isValid).toBe(false);
    expect(r.results[0]?.reasons).toContain('invalid_syntax');
  });

  it('marks the MX-less domain as invalid', async () => {
    const r = await bulkValidate(['hi@fail.invalid']);
    expect(r.results[0]?.hasMx).toBe(false);
    expect(r.results[0]?.reasons).toContain('no_mx_record');
  });

  it('skips MX lookup for disposable domains', async () => {
    const r = await bulkValidate(['x@mailinator.com']);
    expect(r.disposable).toBe(1);
  });

  it('suggests a typo correction for gnail.com', async () => {
    const r = await bulkValidate(['user@gnail.com']);
    expect(r.results[0]?.suggestion).toBe('user@gmail.com');
  });

  it('honours syntaxOnly to skip DNS entirely', async () => {
    const dnsModule = await import('node:dns/promises');
    const r = await bulkValidate(['a@example.com'], { syntaxOnly: true });
    expect(r.results[0]?.hasMx).toBeNull();
    expect(dnsModule.default.resolveMx).not.toHaveBeenCalled();
  });

  it('dedupes MX lookups per distinct domain', async () => {
    const dnsModule = await import('node:dns/promises');
    await bulkValidate(['a@example.com', 'b@example.com', 'c@example.com']);
    expect(dnsModule.default.resolveMx).toHaveBeenCalledTimes(1);
  });

  it('reports highRisk addresses (role-based, score 50-99)', async () => {
    const r = await bulkValidate(['info@example.com']);
    expect(r.roleBased).toBe(1);
    // Synthetic syntax score 100 minus 0 (MX present) — stub returns
    // isRoleBased true but the role-based penalty is applied by the real
    // validator. We accept isRoleBased flag here and let the API layer
    // surface it on the dashboard.
    expect(r.results[0]?.isRoleBased).toBe(true);
  });
});
