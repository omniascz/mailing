import { describe, it, expect } from 'vitest';
import {
  createTrackingToken,
  verifyTrackingToken,
  type UnsubscribePayload,
} from './index.js';

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
