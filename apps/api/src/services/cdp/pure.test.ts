import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  normaliseSignal,
  signalConfidence,
  DEFAULT_SIGNAL_CONFIDENCE,
  shouldMergeProfiles,
  resolveTrait,
  type IdentityEdge,
} from './pure.js';

describe('normaliseSignal', () => {
  it('lowercases email', () => {
    expect(normaliseSignal('email', 'User@EXAMPLE.CZ')).toBe('user@example.cz');
  });

  it('strips non-digit chars from phone', () => {
    expect(normaliseSignal('phone', '+420 777 123 456')).toBe('+420777123456');
  });

  it('hashes raw string as SHA-256 for hashed_id', () => {
    const expected = createHash('sha256').update('petr@example.cz').digest('hex');
    expect(normaliseSignal('hashed_id', 'Petr@Example.cz')).toBe(expected);
  });

  it('preserves already-hashed hashed_id values', () => {
    const hash = 'a'.repeat(64);
    expect(normaliseSignal('hashed_id', hash)).toBe(hash);
  });

  it('keeps case for opaque identifiers', () => {
    expect(normaliseSignal('user_id', 'U-42_ABC')).toBe('U-42_ABC');
    expect(normaliseSignal('social_id', '@AnnaNovakova')).toBe('@AnnaNovakova');
  });
});

describe('signalConfidence', () => {
  it('uses DEFAULT_SIGNAL_CONFIDENCE when no override', () => {
    expect(signalConfidence('email')).toBe(DEFAULT_SIGNAL_CONFIDENCE.email);
  });

  it('allows override and clamps to 0..100', () => {
    expect(signalConfidence('cookie', 200)).toBe(100);
    expect(signalConfidence('cookie', -5)).toBe(0);
    expect(signalConfidence('email', 50)).toBe(50);
  });

  it('user_id outranks cookie', () => {
    expect(signalConfidence('user_id')).toBeGreaterThan(signalConfidence('cookie'));
  });
});

describe('shouldMergeProfiles', () => {
  const mk = (type: 'email' | 'phone' | 'cookie', value: string): IdentityEdge => ({
    type,
    value,
    confidence: DEFAULT_SIGNAL_CONFIDENCE[type],
  });

  it('merges when overlap crosses threshold', () => {
    const left = [mk('email', 'petr@example.cz'), mk('phone', '+420777123456')];
    const right = [mk('email', 'PETR@example.cz'), mk('phone', '+420777123456')];
    const res = shouldMergeProfiles(left, right);
    expect(res.merge).toBe(true);
    expect(res.score).toBe(
      DEFAULT_SIGNAL_CONFIDENCE.email + DEFAULT_SIGNAL_CONFIDENCE.phone,
    );
    expect(res.overlap).toHaveLength(2);
  });

  it('refuses to merge on a single weak signal', () => {
    const left = [mk('cookie', 'abc123')];
    const right = [mk('cookie', 'abc123')];
    const res = shouldMergeProfiles(left, right);
    expect(res.merge).toBe(false);
    expect(res.score).toBe(DEFAULT_SIGNAL_CONFIDENCE.cookie);
  });

  it('returns 0 when no overlap', () => {
    expect(
      shouldMergeProfiles(
        [mk('email', 'a@x.cz')],
        [mk('email', 'b@x.cz')],
      ).score,
    ).toBe(0);
  });
});

describe('resolveTrait', () => {
  const now = new Date();
  const earlier = new Date(now.getTime() - 86_400_000);

  it('picks highest confidence regardless of recency', () => {
    const winner = resolveTrait([
      { source: 'form', value: 'Petr', updatedAt: now, confidence: 40 },
      { source: 'crm', value: 'Petr Novák', updatedAt: earlier, confidence: 90 },
    ]);
    expect(winner?.source).toBe('crm');
  });

  it('breaks ties by most recent updatedAt', () => {
    const winner = resolveTrait([
      { source: 'a', value: 'x', updatedAt: earlier, confidence: 50 },
      { source: 'b', value: 'y', updatedAt: now, confidence: 50 },
    ]);
    expect(winner?.source).toBe('b');
  });

  it('returns null when empty', () => {
    expect(resolveTrait([])).toBeNull();
  });
});
