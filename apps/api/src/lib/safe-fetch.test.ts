/**
 * SSRF guard.
 *
 * The address cases are exhaustive over the ranges an outbound fetch must
 * refuse, and — just as important — over the ones it must NOT refuse. A guard
 * that blocks everything passes a blocklist test suite and breaks the product.
 *
 * The redirect and lookup cases run against real sockets on loopback, because
 * the whole point of this module is that the check happens at connect time; a
 * mocked transport would prove nothing about that.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  isPublicAddress,
  guardedLookup,
  safeFetch,
  assertUrlIsFetchable,
  BlockedUrlError,
} from './safe-fetch.js';

describe('isPublicAddress — ranges that must be refused', () => {
  const blocked: Array<[label: string, ip: string]> = [
    ['loopback v4', '127.0.0.1'],
    ['loopback v4, not .0.1', '127.99.88.77'],
    ['loopback v6', '::1'],
    ['private 10/8', '10.0.0.1'],
    ['private 172.16/12 low', '172.16.0.1'],
    ['private 172.16/12 high', '172.31.255.255'],
    ['private 192.168/16', '192.168.1.1'],
    ['unique local fc00::/7 (fc)', 'fc00::1'],
    ['unique local fc00::/7 (fd)', 'fd12:3456:789a::1'],
    ['link-local 169.254/16', '169.254.1.1'],
    ['cloud metadata', '169.254.169.254'],
    ['link-local v6 fe80::/10', 'fe80::1'],
    ['unspecified v4', '0.0.0.0'],
    ['unspecified v6', '::'],
    ['CGNAT 100.64/10 low', '100.64.0.1'],
    ['CGNAT 100.64/10 high', '100.127.255.255'],
    ['broadcast', '255.255.255.255'],
    ['multicast v4', '224.0.0.1'],
    ['multicast v6', 'ff02::1'],
    ['reserved (TEST-NET-1)', '192.0.2.1'],
    ['reserved (benchmark)', '198.18.0.1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-mapped private', '::ffff:10.0.0.1'],
    ['not an address at all', 'not-an-ip'],
    ['empty', ''],
  ];

  it.each(blocked)('blocks %s (%s)', (_label, ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('isPublicAddress — public addresses must still work', () => {
  const allowed: Array<[label: string, ip: string]> = [
    ['Google DNS', '8.8.8.8'],
    ['Cloudflare DNS', '1.1.1.1'],
    ['ordinary v4', '93.184.216.34'],
    ['just outside 172.16/12', '172.32.0.1'],
    ['just below 172.16/12', '172.15.255.255'],
    ['just outside CGNAT', '100.128.0.1'],
    ['just below CGNAT', '100.63.255.255'],
    ['Cloudflare v6', '2606:4700:4700::1111'],
    ['IPv4-mapped public', '::ffff:8.8.8.8'],
  ];

  it.each(allowed)('allows %s (%s)', (_label, ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe('guardedLookup', () => {
  const lookup = (host: string, all: boolean) =>
    new Promise<{ err: Error | null; value: unknown }>((resolve) => {
      guardedLookup(host, { all } as never, (err, value) => resolve({ err, value }));
    });

  it('refuses a literal loopback address in both callback shapes', async () => {
    for (const all of [true, false]) {
      const { err } = await lookup('127.0.0.1', all);
      expect(err).toBeInstanceOf(BlockedUrlError);
      expect((err as BlockedUrlError).reason).toBe('address');
    }
  });

  it('refuses literal metadata and unspecified addresses', async () => {
    expect((await lookup('169.254.169.254', true)).err).toBeInstanceOf(BlockedUrlError);
    expect((await lookup('0.0.0.0', true)).err).toBeInstanceOf(BlockedUrlError);
  });

  it('refuses a hostname that resolves to loopback', async () => {
    // localhost resolves to 127.0.0.1 / ::1 through the system resolver.
    const { err } = await lookup('localhost', true);
    expect(err).toBeInstanceOf(BlockedUrlError);
  });

  it('passes a literal public address through, preserving the shape', async () => {
    const all = await lookup('8.8.8.8', true);
    expect(all.err).toBeNull();
    expect(all.value).toEqual([{ address: '8.8.8.8', family: 4 }]);

    const one = await lookup('8.8.8.8', false);
    expect(one.err).toBeNull();
    expect(one.value).toBe('8.8.8.8');
  });
});

describe('assertUrlIsFetchable', () => {
  it('rejects non-http schemes before touching DNS', async () => {
    for (const u of ['file:///etc/passwd', 'gopher://127.0.0.1:6379/_INFO', 'ftp://example.com/']) {
      await expect(assertUrlIsFetchable(u)).rejects.toThrow(BlockedUrlError);
    }
  });

  it('rejects a URL pointing at a blocked address', async () => {
    await expect(assertUrlIsFetchable('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /public internet address/,
    );
  });

  it('rejects a malformed URL', async () => {
    await expect(assertUrlIsFetchable('not a url')).rejects.toThrow(BlockedUrlError);
  });
});

describe('safeFetch against real sockets', () => {
  let target: http.Server;
  let redirector: http.Server;
  let targetPort = 0;
  let redirectorPort = 0;
  /** Set by the target server when it is actually reached. */
  let targetHits = 0;

  beforeAll(async () => {
    targetHits = 0;

    // Stands in for an internal service the customer must not reach.
    target = http.createServer((_req, res) => {
      targetHits++;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('INTERNAL SECRET');
    });
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
    targetPort = (target.address() as AddressInfo).port;

    // Answers 302 to the internal service — the hop that gets past a
    // registration-time URL check, proven in the probe report.
    redirector = http.createServer((req, res) => {
      if (req.url === '/loop') {
        res.writeHead(302, { Location: `http://127.0.0.1:${redirectorPort}/loop` });
        return res.end();
      }
      res.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/internal` });
      res.end();
    });
    await new Promise<void>((r) => redirector.listen(0, '127.0.0.1', r));
    redirectorPort = (redirector.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => target.close(() => r()));
    await new Promise<void>((r) => redirector.close(() => r()));
  });

  it('refuses a direct call to a loopback address', async () => {
    await expect(safeFetch(`http://127.0.0.1:${targetPort}/internal`)).rejects.toThrow(
      BlockedUrlError,
    );
    expect(targetHits, 'the internal server must never have been reached').toBe(0);
  });

  /**
   * The real shape of the attack: hop 1 is a host the customer is entitled to
   * register, hop 2 is not. Both test servers can only listen on loopback, so
   * the policy here allows the redirector's port and blocks everything else —
   * that makes hop 1 succeed exactly as a public host would, leaving hop 2 as
   * the only thing that can stop the request.
   *
   * If validation ran only on the URL the customer typed, this test reaches the
   * internal server and reads "INTERNAL SECRET".
   */
  const allowLoopback = { addressPolicy: (ip: string) => ip === '127.0.0.1' };

  it('sanity: with the loopback policy the test servers ARE reachable', async () => {
    // Without this, a rejection below could be the first hop failing rather
    // than the redirect target being refused, and the test would prove nothing.
    const direct = await safeFetch(`http://127.0.0.1:${targetPort}/internal`, allowLoopback);
    expect(direct.status).toBe(200);
    expect(direct.body).toBe('INTERNAL SECRET');
    expect(targetHits).toBeGreaterThan(0);
  });

  it('re-runs the guard on the redirect target, after a reachable first hop', async () => {
    const before = targetHits;
    // Allow the first connection, refuse every later one. Both hops resolve to
    // the same address, so the only thing that can stop hop 2 is the guard
    // running again — which is exactly the claim under test.
    let calls = 0;
    await expect(
      safeFetch(`http://127.0.0.1:${redirectorPort}/hop`, { addressPolicy: () => calls++ === 0 }),
    ).rejects.toThrow(BlockedUrlError);
    expect(calls, 'the guard must run once per hop, not once per request').toBeGreaterThan(1);
    expect(targetHits, 'the internal server must never have been reached').toBe(before);
  });

  it('gives up rather than following a redirect loop forever', async () => {
    await expect(
      safeFetch(`http://127.0.0.1:${redirectorPort}/loop`, { ...allowLoopback, maxRedirects: 3 }),
    ).rejects.toThrow(/redirected more than 3 times/);
  });

  it('truncates a body at maxBytes instead of reading it all', async () => {
    const res = await safeFetch(`http://127.0.0.1:${targetPort}/internal`, {
      ...allowLoopback,
      maxBytes: 8,
    });
    expect(res.truncated).toBe(true);
    expect(res.body).toBe('INTERNAL');
  });

  it('refuses non-http schemes without opening a socket', async () => {
    await expect(safeFetch('file:///c:/windows/win.ini')).rejects.toThrow(
      /Only http:\/\/ and https:\/\//,
    );
  });
});
