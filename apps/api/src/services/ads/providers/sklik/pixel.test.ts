/**
 * Pure-only tests for the Sklik pixel module — covers snippet generation,
 * tracking-event parsing, validation. DB-bound functions (resolveTrackedSite /
 * recordPixelEvent / buildAudienceFromPixel) are exercised by integration
 * tests; here we focus on the deterministic helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSklikSnippet,
  parseTrackingEvent,
  isValidSiteToken,
  newVisitorId,
  hashEmail,
  VISITOR_COOKIE,
} from './pixel.js';
import { createHash } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('generateSklikSnippet', () => {
  it('embeds the site token verbatim and returns a JS string', () => {
    const out = generateSklikSnippet('site-abc-123');
    expect(out).toContain('"site-abc-123"');
    expect(out).toContain('event.gif');
    expect(out).toContain(VISITOR_COOKIE);
  });

  it('uses a custom endpoint base when supplied', () => {
    const out = generateSklikSnippet('s1', { endpointBase: 'https://api.forgemsg.com' });
    expect(out).toContain('"https://api.forgemsg.com"');
  });

  it('rejects fully unsafe / empty site tokens', () => {
    // Strips to '' after sanitisation → throws.
    expect(() => generateSklikSnippet('()<>{}[]')).toThrow(/Invalid site token/);
    expect(() => generateSklikSnippet('')).toThrow(/Invalid site token/);
  });

  it('strips unsafe characters and keeps the safe ones', () => {
    // `<script>` → `script`, still non-empty so it returns JS — but the
    // dangerous chars never make it into the output.
    const out = generateSklikSnippet('foo<script>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('"fooscript"');
  });

  it('exposes window.forgemsg.identify hook', () => {
    expect(generateSklikSnippet('s1')).toContain('window.forgemsg.identify');
  });
});

describe('isValidSiteToken', () => {
  it('accepts hex / base64-url style tokens', () => {
    expect(isValidSiteToken('abcdef12')).toBe(true);
    expect(isValidSiteToken('a-b_c-12345678')).toBe(true);
  });

  it('rejects too short / unsafe', () => {
    expect(isValidSiteToken('short')).toBe(false);
    expect(isValidSiteToken('has space')).toBe(false);
    expect(isValidSiteToken('has<tag>injection')).toBe(false);
  });
});

describe('newVisitorId', () => {
  it('returns a 32-char hex id', () => {
    const id = newVisitorId();
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces distinct values', () => {
    expect(newVisitorId()).not.toBe(newVisitorId());
  });
});

describe('hashEmail', () => {
  it('lowercases + trims before hashing', () => {
    expect(hashEmail('  Jane@Example.COM ')).toBe(sha('jane@example.com'));
  });
});

describe('parseTrackingEvent', () => {
  const baseQuery = { v: 'visitor-1', u: 'https://example.com/page', t: '1700000000000' };

  it('parses well-formed query', () => {
    const ev = parseTrackingEvent(baseQuery);
    expect(ev).not.toBeNull();
    expect(ev?.visitorId).toBe('visitor-1');
    expect(ev?.url).toBe('https://example.com/page');
    expect(ev?.ts.getTime()).toBe(1700000000000);
  });

  it('returns null when visitorId or url is missing', () => {
    expect(parseTrackingEvent({ u: 'https://x' })).toBeNull();
    expect(parseTrackingEvent({ v: 'x' })).toBeNull();
  });

  it('captures email lowercased + trimmed when valid', () => {
    const ev = parseTrackingEvent({ ...baseQuery, e: ' JANE@EXAMPLE.COM ' });
    expect(ev?.emailLower).toBe('jane@example.com');
  });

  it('drops bare strings missing @ from email', () => {
    const ev = parseTrackingEvent({ ...baseQuery, e: 'no-at-sign' });
    expect(ev?.emailLower).toBeNull();
  });

  it('uses fallback timestamp when t is missing or invalid', () => {
    const fallback = new Date('2026-04-25T12:00:00Z');
    const a = parseTrackingEvent({ v: 'x', u: 'https://x' }, fallback);
    expect(a?.ts.getTime()).toBe(fallback.getTime());
    const b = parseTrackingEvent({ v: 'x', u: 'https://x', t: 'NaN' }, fallback);
    expect(b?.ts.getTime()).toBe(fallback.getTime());
  });

  it('captures phone verbatim when present', () => {
    const ev = parseTrackingEvent({ ...baseQuery, p: '+420123456789' });
    expect(ev?.phone).toBe('+420123456789');
  });
});
