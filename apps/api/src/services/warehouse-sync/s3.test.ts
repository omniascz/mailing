import { describe, it, expect } from 'vitest';
import { getSignatureKey } from './s3.js';

describe('AWS SigV4 getSignatureKey', () => {
  // Published AWS derivation vector:
  // https://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html
  it('matches the documented signing-key vector', () => {
    const key = getSignatureKey(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20120215',
      'us-east-1',
      'iam',
    );
    expect(key.toString('hex')).toBe(
      'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d',
    );
  });

  it('produces a 32-byte key', () => {
    const key = getSignatureKey('secret', '20240101', 'eu-central-1', 's3');
    expect(key).toHaveLength(32);
  });
});
