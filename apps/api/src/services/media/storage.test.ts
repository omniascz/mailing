/**
 * Which addresses the source fetch is allowed to reach.
 *
 * `media_assets.storage_url` is a free-form URL column — the create route
 * accepts any `z.string().url()` — so "fetch the source image" is a request
 * whose destination the customer picks. Everything goes through the SSRF
 * guard, with exactly one widening: our own object store, which normally sits
 * on a private address.
 *
 * That widening is the part worth testing, because a sloppy version of it
 * ("does the URL contain the storage host?") re-opens the hole it was carved
 * out of.
 */
import { describe, it, expect } from 'vitest';
import { isOwnStorageUrl, sourceAddressPolicy } from './storage.js';
import { isPublicAddress } from '../../lib/safe-fetch.js';

const endpoint = { host: 'localhost', port: 9000, useSsl: false, bucket: 'forgemsg' };

describe('isOwnStorageUrl', () => {
  it('recognises the configured store', () => {
    expect(isOwnStorageUrl('http://localhost:9000/forgemsg/media/a.png', endpoint)).toBe(true);
    expect(isOwnStorageUrl('http://LOCALHOST:9000/forgemsg/a.png', endpoint)).toBe(true);
  });

  it('is not fooled by a host that merely contains ours', () => {
    // The bug this test exists for: `url.hostname.includes(endpoint.host)`.
    expect(isOwnStorageUrl('http://localhost.attacker.example:9000/x.png', endpoint)).toBe(false);
    expect(isOwnStorageUrl('http://notlocalhost:9000/x.png', endpoint)).toBe(false);
    expect(isOwnStorageUrl('http://attacker.example/?x=localhost:9000', endpoint)).toBe(false);
  });

  it('is not fooled by another port on the same host', () => {
    // Same machine, different service — the API itself, or Redis.
    expect(isOwnStorageUrl('http://localhost:3001/api/v1/internal/contacts', endpoint)).toBe(false);
    expect(isOwnStorageUrl('http://localhost:6379/', endpoint)).toBe(false);
  });

  it('refuses schemes that are not http(s)', () => {
    expect(isOwnStorageUrl('file:///etc/passwd', endpoint)).toBe(false);
    expect(isOwnStorageUrl('gopher://localhost:9000/', endpoint)).toBe(false);
    expect(isOwnStorageUrl('not a url', endpoint)).toBe(false);
  });

  it('applies the default port when the URL omits it', () => {
    const https = { host: 'cdn.example.com', port: 443, useSsl: true, bucket: 'b' };
    expect(isOwnStorageUrl('https://cdn.example.com/x.png', https)).toBe(true);
    expect(isOwnStorageUrl('http://cdn.example.com/x.png', https)).toBe(false);
  });
});

describe('sourceAddressPolicy', () => {
  it('allows a private address only for our own store', () => {
    const own = sourceAddressPolicy('http://localhost:9000/forgemsg/a.png', endpoint);
    expect(own('127.0.0.1')).toBe(true);
    expect(own('10.0.0.5')).toBe(true);
  });

  it('keeps the public-only rule for every other URL', () => {
    const other = sourceAddressPolicy('http://images.example.com/a.png', endpoint);
    expect(other).toBe(isPublicAddress);
    // The addresses an SSRF is aimed at.
    expect(other('127.0.0.1')).toBe(false);
    expect(other('169.254.169.254')).toBe(false);
    expect(other('10.0.0.5')).toBe(false);
    expect(other('::1')).toBe(false);
    // …and a normal one still works.
    expect(other('93.184.216.34')).toBe(true);
  });

  it('does not widen for a different port on the storage host', () => {
    const api = sourceAddressPolicy('http://localhost:3001/api/v1/internal/contacts', endpoint);
    expect(api('127.0.0.1')).toBe(false);
  });
});
