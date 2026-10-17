/**
 * The fingerprint a GDPR erasure keeps of a phone number (Z180): an HMAC
 * under SUPPRESSION_HASH_KEY of `phone:` and the number in one spelling, so
 * the three spellings Z179 measured for one number give one fingerprint, and
 * the e-mail fingerprint of the same string is never equal to it.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import { suppressionEmailHash } from './email.js';
import { suppressionPhone, suppressionPhoneHash, suppressionPhoneHashWith } from './phone.js';

const number = '+420777721092';
const hmacUnder = (key: string, s: string) => createHmac('sha256', key).update(s).digest('hex');

describe('suppressionPhoneHash', () => {
  it('is the HMAC-SHA256 of `phone:` + the number under SUPPRESSION_HASH_KEY, 64 hex characters', () => {
    expect(suppressionPhoneHash(number)).toBe(
      hmacUnder(env.SUPPRESSION_HASH_KEY, `phone:${number}`),
    );
    expect(suppressionPhoneHash(number)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(suppressionPhoneHash(number)).toBe(suppressionPhoneHash(number));
  });

  it('another key gives another fingerprint', () => {
    const one = suppressionPhoneHashWith('first-key-for-this-test-0123456789abcdef', number);
    const two = suppressionPhoneHashWith('second-key-for-this-test-0123456789abcde', number);
    expect(one).not.toBe(two);
    expect(suppressionPhoneHash(number)).not.toBe(one);
  });

  it('is not the e-mail fingerprint of the same string', () => {
    expect(suppressionPhoneHash(number)).not.toBe(suppressionEmailHash(number));
    expect(suppressionPhoneHash(number)).not.toBe(
      hmacUnder(env.SUPPRESSION_HASH_KEY, number.toLowerCase()),
    );
  });

  // Z179, Sonda 5: the three spellings one number was typed in.
  it('the spellings of one number give one fingerprint', () => {
    for (const typed of ['+420 777 721 092', '+420777721092', '00420777721092']) {
      expect(suppressionPhone(typed)).toBe(number);
      expect(suppressionPhoneHash(typed)).toBe(suppressionPhoneHash(number));
    }
  });

  it('another number gives another fingerprint', () => {
    expect(suppressionPhoneHash('+420777721093')).not.toBe(suppressionPhoneHash(number));
  });
});
