import { describe, it, expect } from 'vitest';
import { evaluatePtr } from './index.js';

const AT = '2026-07-03T00:00:00.000Z';

describe('evaluatePtr', () => {
  it('confirms match + FCrDNS when PTR forward-resolves back to the IP', () => {
    const r = evaluatePtr(
      '203.0.113.5',
      'mta1.forgemsg.com',
      ['mta1.forgemsg.com.'],
      { 'mta1.forgemsg.com': ['203.0.113.5'] },
      AT,
    );
    expect(r.matchesConfigured).toBe(true);
    expect(r.forwardConfirmed).toBe(true);
    expect(r.resolvedPtr).toEqual(['mta1.forgemsg.com']);
  });

  it('flags mismatch when the live PTR differs from the configured one', () => {
    const r = evaluatePtr(
      '203.0.113.5',
      'mta1.forgemsg.com',
      ['other.example.net'],
      { 'other.example.net': ['203.0.113.5'] },
      AT,
    );
    expect(r.matchesConfigured).toBe(false);
    expect(r.forwardConfirmed).toBe(true); // still FCrDNS, just not the expected name
  });

  it('is not forward-confirmed when the PTR host resolves to a different IP', () => {
    const r = evaluatePtr(
      '203.0.113.5',
      'mta1.forgemsg.com',
      ['mta1.forgemsg.com'],
      { 'mta1.forgemsg.com': ['198.51.100.9'] },
      AT,
    );
    expect(r.matchesConfigured).toBe(true);
    expect(r.forwardConfirmed).toBe(false);
  });

  it('handles an empty reverse-DNS answer', () => {
    const r = evaluatePtr('203.0.113.5', 'mta1.forgemsg.com', [], {}, AT);
    expect(r.matchesConfigured).toBe(false);
    expect(r.forwardConfirmed).toBe(false);
    expect(r.resolvedPtr).toEqual([]);
  });

  it('normalises case + trailing dot', () => {
    const r = evaluatePtr(
      '203.0.113.5',
      'MTA1.ForgeMsg.com',
      ['mta1.forgemsg.com.'],
      { 'mta1.forgemsg.com': ['203.0.113.5'] },
      AT,
    );
    expect(r.matchesConfigured).toBe(true);
  });
});
