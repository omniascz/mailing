import { describe, it, expect } from 'vitest';
import { fetchConnectedContent, isHostAllowed, parseConnectedUrl } from './connected-content.js';

describe('parseConnectedUrl', () => {
  it('accepts http + https', () => {
    expect(parseConnectedUrl('https://example.com/x')).not.toBeNull();
    expect(parseConnectedUrl('http://example.com/x')).not.toBeNull();
  });
  it('rejects file:// and ftp://', () => {
    expect(parseConnectedUrl('file:///etc/passwd')).toBeNull();
    expect(parseConnectedUrl('ftp://example.com')).toBeNull();
  });
  it('rejects non-URLs', () => {
    expect(parseConnectedUrl('not a url')).toBeNull();
    expect(parseConnectedUrl('')).toBeNull();
  });
});

describe('isHostAllowed', () => {
  it('exact match', () => {
    expect(isHostAllowed('api.example.com', ['api.example.com'])).toBe(true);
  });
  it('case-insensitive', () => {
    expect(isHostAllowed('API.Example.COM', ['api.example.com'])).toBe(true);
  });
  it('wildcard subdomain', () => {
    expect(isHostAllowed('a.example.com', ['*.example.com'])).toBe(true);
    expect(isHostAllowed('b.x.example.com', ['*.example.com'])).toBe(true);
  });
  it('wildcard does not match apex', () => {
    expect(isHostAllowed('example.com', ['*.example.com'])).toBe(false);
  });
  it('empty allow list = deny everything', () => {
    expect(isHostAllowed('example.com', [])).toBe(false);
  });
});

describe('fetchConnectedContent — guards', () => {
  it('rejects an invalid URL', async () => {
    const r = await fetchConnectedContent({ url: 'not a url', allowedHosts: [] });
    expect(r.reason).toBe('invalid_url');
    expect(r.ok).toBe(false);
  });

  it('rejects a disallowed host', async () => {
    const r = await fetchConnectedContent({
      url: 'https://malicious.example/',
      allowedHosts: ['allowed.example'],
    });
    expect(r.reason).toBe('host_blocked');
  });

  it('rejects literal private IPs', async () => {
    const r = await fetchConnectedContent({
      url: 'http://127.0.0.1/',
      allowedHosts: ['127.0.0.1'],
    });
    expect(r.reason).toBe('private_ip');
  });

  it('rejects literal link-local IPv6', async () => {
    const r = await fetchConnectedContent({
      url: 'http://[fe80::1]/',
      allowedHosts: ['fe80::1'],
    });
    expect(r.reason).toBe('private_ip');
  });

  it('refuses to follow redirects', async () => {
    const fetchImpl = (() =>
      new Response('redirected', {
        status: 302,
        headers: { location: 'http://elsewhere.example' },
      })) as unknown as typeof globalThis.fetch;
    const r = await fetchConnectedContent({
      url: 'https://1.1.1.1/',
      allowedHosts: ['1.1.1.1'],
      fetchImpl,
    });
    expect(r.reason).toBe('http_error');
  });

  it('refuses non-JSON content', async () => {
    const fetchImpl = (() =>
      new Response('<html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof globalThis.fetch;
    const r = await fetchConnectedContent({
      url: 'https://1.1.1.1/',
      allowedHosts: ['1.1.1.1'],
      fetchImpl,
    });
    expect(r.reason).toBe('invalid_content');
  });

  it('refuses invalid JSON', async () => {
    const fetchImpl = (() =>
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;
    const r = await fetchConnectedContent({
      url: 'https://1.1.1.1/',
      allowedHosts: ['1.1.1.1'],
      fetchImpl,
    });
    expect(r.reason).toBe('invalid_content');
  });

  it('returns parsed JSON on the happy path', async () => {
    const fetchImpl = (() =>
      new Response(JSON.stringify({ a: 1, b: 'two' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;
    const r = await fetchConnectedContent({
      url: 'https://1.1.1.1/',
      allowedHosts: ['1.1.1.1'],
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('fetched');
    expect(r.data).toEqual({ a: 1, b: 'two' });
  });

  it('enforces the byte cap by aborting mid-stream', async () => {
    const tooBig = JSON.stringify({ filler: 'x'.repeat(2_000) });
    const fetchImpl = (() =>
      new Response(tooBig, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;
    const r = await fetchConnectedContent({
      url: 'https://1.1.1.1/',
      allowedHosts: ['1.1.1.1'],
      fetchImpl,
      maxBytes: 500,
    });
    expect(r.reason).toBe('too_large');
  });
});
