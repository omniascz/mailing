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

  it('does not verify anything when no app secret is configured', () => {
    // Was: 'opens (returns true) when no app secret is configured (dev)'. An
    // unset secret is the absence of a check, and the absence of a check is
    // not a pass — that shape accepted forged webhooks in any deployment that
    // had not configured Meta.
    expect(verifyMetaSignature(body, undefined, undefined)).toBe(false);
    expect(verifyMetaSignature(body, goodSig, undefined)).toBe(false);
  });

  it('opens without a secret only when the operator asks for it', () => {
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    try {
      expect(verifyMetaSignature(body, undefined, undefined)).toBe(true);
    } finally {
      delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
    }
  });

  it('the escape hatch cannot be reached in production', () => {
    // webhook-switches.ts:35 checks NODE_ENV before the flag, and the flag
    // cannot override it. Asserted here because this module is now the thing
    // that depends on it.
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    try {
      expect(verifyMetaSignature(body, undefined, undefined)).toBe(false);
    } finally {
      process.env.NODE_ENV = prevEnv;
      delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
    }
  });
});
