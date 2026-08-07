import { describe, it, expect, afterEach } from 'vitest';
import { createTrackingToken, verifyTrackingToken, type UnsubscribePayload } from './index.js';

describe('unsubscribe tracking token (#440 / one-click unsub)', () => {
  const payload: UnsubscribePayload = {
    type: 'unsub',
    orgId: 'org-123',
    contactId: 'contact-456',
    campaignId: 'camp-789',
    ts: 1_700_000_000,
  };

  it('round-trips a signed unsub token', () => {
    const token = createTrackingToken(payload);
    const decoded = verifyTrackingToken(token);
    expect(decoded).toEqual(payload);
    expect(decoded?.type).toBe('unsub');
  });

  it('rejects a tampered token', () => {
    const token = createTrackingToken(payload);
    // Flip a character in the payload segment.
    const [enc, sig] = token.split('.');
    const tampered = `${enc}x.${sig}`;
    expect(verifyTrackingToken(tampered)).toBeNull();
  });

  it('rejects a forged signature', () => {
    const token = createTrackingToken(payload);
    const enc = token.split('.')[0];
    expect(verifyTrackingToken(`${enc}.deadbeef`)).toBeNull();
  });

  it('rejects a token with no signature separator', () => {
    expect(verifyTrackingToken('not-a-token')).toBeNull();
  });

  it('keeps unsub tokens distinguishable from pref tokens by type', () => {
    const prefToken = createTrackingToken({
      type: 'pref',
      orgId: 'org-123',
      contactId: 'contact-456',
      ts: 1_700_000_000,
    });
    const decoded = verifyTrackingToken(prefToken);
    expect(decoded?.type).toBe('pref');
  });
});

/**
 * The signing key itself.
 *
 * Until this was brought under `prodRequired`, TRACKING_SECRET had no schema
 * entry in either app and was set in no compose file, helm values or env
 * example — so every deployment signed with the constant below, which is
 * committed here. Anyone who read the repository could mint a valid open,
 * click, or somebody else's unsubscribe.
 *
 * The env schemas make a production boot fail without it. These tests cover
 * what the schemas cannot: that this module, which is what actually signs,
 * reads the variable at call time and refuses the fallback in production.
 */
describe('TRACKING_SECRET', () => {
  const payload: UnsubscribePayload = {
    type: 'unsub',
    orgId: 'org-123',
    contactId: 'contact-456',
    ts: 1_700_000_000,
  };

  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('a token signed with the dev fallback is rejected once a real secret is set', () => {
    // Mint under the fallback, exactly as an attacker reading this repo would.
    delete process.env.TRACKING_SECRET;
    process.env.NODE_ENV = 'development';
    const forged = createTrackingToken(payload);
    expect(verifyTrackingToken(forged)).toEqual(payload);

    // Now the deployment has a real key. The forgery must stop verifying.
    process.env.TRACKING_SECRET = 'a-real-tracking-secret-32-chars-min';
    expect(verifyTrackingToken(forged)).toBeNull();

    // And a token minted under the real key round-trips.
    expect(verifyTrackingToken(createTrackingToken(payload))).toEqual(payload);
  });

  it('reads the variable at call time, not at import time', () => {
    // The old module-level const captured whatever was set when this file was
    // first imported, so a process that loads its .env afterwards signed with
    // the fallback and had no way to tell.
    process.env.TRACKING_SECRET = 'first-tracking-secret-32-chars-min-x';
    const first = createTrackingToken(payload);

    process.env.TRACKING_SECRET = 'second-tracking-secret-32-chars-min-x';
    const second = createTrackingToken(payload);

    expect(first).not.toBe(second);
    expect(verifyTrackingToken(first)).toBeNull();
    expect(verifyTrackingToken(second)).toEqual(payload);
  });

  it('throws rather than signing with the committed fallback in production', () => {
    delete process.env.TRACKING_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => createTrackingToken(payload)).toThrow(/TRACKING_SECRET is not set/);
    expect(() => verifyTrackingToken('anything.atall')).toThrow(/TRACKING_SECRET is not set/);
  });

  it('outside production an unset secret still falls back, so dev keeps working', () => {
    delete process.env.TRACKING_SECRET;
    process.env.NODE_ENV = 'development';
    const token = createTrackingToken(payload);
    expect(verifyTrackingToken(token)).toEqual(payload);
  });
});
