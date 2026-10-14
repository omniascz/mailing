/**
 * The erasure fingerprint is an HMAC under SUPPRESSION_HASH_KEY, not a plain
 * SHA-256 of the address (Z150). A plain SHA-256 can be reversed by anyone
 * holding the database: hash a list of addresses and look for a match.
 */
import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import { suppressionEmailHash, suppressionEmailHashWith } from './email.js';

const address = 'jana.novakova@example.cz';
const hmacUnder = (key: string, s: string) => createHmac('sha256', key).update(s).digest('hex');

describe('suppressionEmailHash', () => {
  it('is not the SHA-256 of the address', () => {
    expect(suppressionEmailHash(address)).not.toBe(
      createHash('sha256').update(address).digest('hex'),
    );
  });

  it('is the HMAC-SHA256 of the address under SUPPRESSION_HASH_KEY, 64 hex characters', () => {
    expect(suppressionEmailHash(address)).toBe(hmacUnder(env.SUPPRESSION_HASH_KEY, address));
    expect(suppressionEmailHash(address)).toMatch(/^[0-9a-f]{64}$/);
    const known = 'a-known-key-for-this-test-only-0123456789';
    expect(suppressionEmailHashWith(known, address)).toBe(hmacUnder(known, address));
  });

  it('another key gives another fingerprint', () => {
    const one = suppressionEmailHashWith('first-key-for-this-test-0123456789abcdef', address);
    const two = suppressionEmailHashWith('second-key-for-this-test-0123456789abcde', address);
    expect(one).not.toBe(two);
    expect(suppressionEmailHash(address)).not.toBe(one);
  });

  it('capitals and surrounding spaces give the same fingerprint', () => {
    for (const typed of [
      'Jana.Novakova@Example.CZ',
      '  jana.novakova@example.cz  ',
      ' JANA.NOVAKOVA@EXAMPLE.CZ',
    ])
      expect(suppressionEmailHash(typed)).toBe(suppressionEmailHash(address));
  });
});
