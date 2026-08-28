import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { checkWebhookSignature, timingSafeEqualString } from './webhook-signature.js';

const hmac = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const verify = (body: string, sig: string, secret: string) => hmac(body, secret) === sig;

describe('a missing secret is a refusal, not a bypass', () => {
  for (const [label, secret] of [
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
  ] as const) {
    it(`refuses when the stored secret is ${label}`, () => {
      const res = checkWebhookSignature({
        integration: 'Shoptet',
        secret,
        signature: 'anything',
        rawBody: '{}',
        verify: () => true, // would pass if it were ever reached
      });
      expect(res.ok).toBe(false);
      expect(res).toMatchObject({ status: 401, code: 'WEBHOOK_SECRET_NOT_CONFIGURED' });
    });
  }

  it('does not call the verifier at all when there is no secret', () => {
    // The old shape short-circuited the other way: no secret meant the verifier
    // was skipped AND the request accepted. Here it is skipped and refused.
    const spy = vi.fn(() => true);
    const res = checkWebhookSignature({
      integration: 'Shoptet',
      secret: '',
      signature: 'sig',
      rawBody: '{}',
      verify: spy,
    });
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('names the integration, so the operator knows which connection to fix', () => {
    const res = checkWebhookSignature({
      integration: 'Shoptet',
      secret: undefined,
      signature: 'x',
      rawBody: '{}',
      verify: () => true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('Shoptet');
  });
});

describe('with a secret, the signature decides', () => {
  const SECRET = 'shared-secret';
  const BODY = '{"order":1}';

  it('accepts a correct signature', () => {
    const res = checkWebhookSignature({
      integration: 'Shoptet',
      secret: SECRET,
      signature: hmac(BODY, SECRET),
      rawBody: BODY,
      verify,
    });
    expect(res.ok).toBe(true);
  });

  it('refuses a wrong signature', () => {
    const res = checkWebhookSignature({
      integration: 'Shoptet',
      secret: SECRET,
      signature: hmac(BODY, 'other-secret'),
      rawBody: BODY,
      verify,
    });
    expect(res).toMatchObject({ status: 401, code: 'INVALID_SIGNATURE' });
  });

  it('refuses a missing signature, and says so differently from a missing secret', () => {
    const res = checkWebhookSignature({
      integration: 'Shoptet',
      secret: SECRET,
      signature: '',
      rawBody: BODY,
      verify,
    });
    expect(res).toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('refuses a body that was tampered with after signing', () => {
    const res = checkWebhookSignature({
      integration: 'Shoptet',
      secret: SECRET,
      signature: hmac(BODY, SECRET),
      rawBody: '{"order":2}',
      verify,
    });
    expect(res).toMatchObject({ code: 'INVALID_SIGNATURE' });
  });
});

describe('timingSafeEqualString — the generic receiver compared with !==', () => {
  it('is true only for identical strings', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
  });

  it('handles different lengths without throwing', () => {
    // The reason the digests are compared rather than the raw buffers:
    // timingSafeEqual throws on a length mismatch, which would turn a wrong
    // secret into a 500 and leak the length.
    expect(() => timingSafeEqualString('short', 'a-much-longer-secret')).not.toThrow();
    expect(timingSafeEqualString('short', 'a-much-longer-secret')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(timingSafeEqualString('', '')).toBe(true);
    expect(timingSafeEqualString('', 'x')).toBe(false);
  });

  it('compares the whole string, not a prefix', () => {
    // `!==` returns at the first differing byte; the digest comparison cannot,
    // because one differing byte changes the whole digest.
    const a = 'a'.repeat(64);
    expect(timingSafeEqualString(a, a.slice(0, 63) + 'b')).toBe(false);
    expect(timingSafeEqualString(a, 'b' + a.slice(1))).toBe(false);
  });
});
