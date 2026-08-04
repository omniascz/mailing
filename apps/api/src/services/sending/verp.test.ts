import { describe, it, expect } from 'vitest';
import { encodeVerp, decodeVerp } from '@forgemsg/shared/sending/verp';

describe('VERP encode/decode', () => {
  it('round-trips a Message-ID through the return path', () => {
    const msgId = '<abc123@forgemsg.com>';
    const addr = encodeVerp(msgId, 'bounce.mail.acme.cz');
    expect(addr).toBe('bounce+abc123=forgemsg.com@bounce.mail.acme.cz');
    expect(decodeVerp(addr)).toBe(msgId);
  });

  it('round-trips a UUID Message-ID (the real send format)', () => {
    const msgId = '<3f6a2c1e-9b0d-4e5f-8a7b-1c2d3e4f5a6b@forgemsg.com>';
    const addr = encodeVerp(msgId, 'bounce.x.io');
    expect(decodeVerp(addr)).toBe(msgId);
  });

  it('decodes an address wrapped in angle brackets', () => {
    expect(decodeVerp('<bounce+abc=forgemsg.com@bounce.x.io>')).toBe('<abc@forgemsg.com>');
  });

  it('returns null for non-VERP addresses', () => {
    expect(decodeVerp('mailer-daemon@gmail.com')).toBeNull();
    expect(decodeVerp('user@forgemsg.com')).toBeNull();
    expect(decodeVerp('')).toBeNull();
    expect(decodeVerp(null)).toBeNull();
    expect(decodeVerp(undefined)).toBeNull();
  });

  it('returns null when the decoded id is not a single-@ Message-ID', () => {
    // No '=' → decoded local has zero '@'.
    expect(decodeVerp('bounce+nonsense@bounce.x.io')).toBeNull();
  });
});
