import { describe, it, expect } from 'vitest';
import { generateTotpSecret, generateTotpCode, verifyTotpCode } from './index.js';

describe('TOTP (login enforcement primitives)', () => {
  it('accepts a freshly generated code for its secret', () => {
    const secret = generateTotpSecret();
    const at = 1_700_000_000_000;
    const code = generateTotpCode(secret, at);
    expect(verifyTotpCode(secret, code, at)).toBe(true);
  });

  it('accepts the adjacent 30s windows (clock skew tolerance)', () => {
    const secret = generateTotpSecret();
    const at = 1_700_000_000_000;
    const prev = generateTotpCode(secret, at - 30_000);
    const next = generateTotpCode(secret, at + 30_000);
    expect(verifyTotpCode(secret, prev, at)).toBe(true);
    expect(verifyTotpCode(secret, next, at)).toBe(true);
  });

  it('rejects a wrong or malformed code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
    expect(verifyTotpCode(secret, 'abc')).toBe(false);
    expect(verifyTotpCode(secret, '12345')).toBe(false);
  });

  it('rejects a code generated from a different secret', () => {
    const at = 1_700_000_000_000;
    const code = generateTotpCode(generateTotpSecret(), at);
    expect(verifyTotpCode(generateTotpSecret(), code, at)).toBe(false);
  });
});
