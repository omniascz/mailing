import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyStripeSignature } from './payments.js';

const SECRET = 'whsec_test_secret';

function sign(rawBody: string, secret: string, t: number): string {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

describe('verifyStripeSignature', () => {
  const body = JSON.stringify({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1' } },
  });
  const now = 1_700_000_000;

  it('accepts a correctly signed payload', () => {
    const header = sign(body, SECRET, now);
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET, 300, now)).toBe(true);
  });

  it('rejects a forged signature (the original vulnerability)', () => {
    expect(verifyStripeSignature(Buffer.from(body), `t=${now},v1=deadbeef`, SECRET, 300, now)).toBe(
      false,
    );
  });

  it('rejects when the body was tampered with after signing', () => {
    const header = sign(body, SECRET, now);
    const tampered = JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_HACKED' } },
    });
    expect(verifyStripeSignature(Buffer.from(tampered), header, SECRET, 300, now)).toBe(false);
  });

  it('rejects a signature from the wrong secret', () => {
    const header = sign(body, 'whsec_other', now);
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET, 300, now)).toBe(false);
  });

  it('rejects an expired timestamp (replay protection)', () => {
    const header = sign(body, SECRET, now - 10_000); // well outside 300s tolerance
    expect(verifyStripeSignature(Buffer.from(body), header, SECRET, 300, now)).toBe(false);
  });

  it('rejects an empty or malformed header', () => {
    expect(verifyStripeSignature(Buffer.from(body), '', SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(Buffer.from(body), 'garbage', SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(Buffer.from(body), `t=${now}`, SECRET, 300, now)).toBe(false);
  });
});
