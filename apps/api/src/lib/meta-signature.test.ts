import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyMetaSignature } from './meta-signature.js';

const SECRET = 'app_secret_123';
const body = Buffer.from(JSON.stringify({ entry: [{ id: 'page1' }] }));
const goodSig = `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;

describe('verifyMetaSignature', () => {
  it('accepts a correctly signed body', () => {
    expect(verifyMetaSignature(body, goodSig, SECRET)).toBe(true);
  });

  it('rejects a forged signature', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(JSON.stringify({ entry: [{ id: 'evil' }] }));
    expect(verifyMetaSignature(tampered, goodSig, SECRET)).toBe(false);
  });

  it('rejects when the signature header is missing', () => {
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false);
  });

  it('opens (returns true) when no app secret is configured (dev)', () => {
    expect(verifyMetaSignature(body, undefined, undefined)).toBe(true);
  });
});
