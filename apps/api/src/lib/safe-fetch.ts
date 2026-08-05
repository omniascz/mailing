/**
 * Outbound HTTP for customer-supplied URLs (SSRF guard).
 *
 * A customer types a URL — a webhook endpoint, an RSS feed, a site to scrape a
 * brand kit from — and the server fetches it. Without a guard that is a request
 * forgery primitive: the attacker picks the destination and our process picks
 * the source address, so `http://169.254.169.254/` returns cloud credentials
 * and `http://127.0.0.1:3001/api/v1/internal/...` reaches routes that are not
 * exposed to the internet at all.
 *
 * ─── Why the check lives in `lookup` ─────────────────────────────────────────
 *
 * The obvious implementation — resolve the hostname, check the address, then
 * `fetch()` — does not hold. Between the check and the connect, the name is
 * resolved a SECOND time by the socket layer, and nothing forces the two
 * answers to agree. An attacker serves a record with TTL 0 that answers
 * 93.184.216.34 for our check and 127.0.0.1 for the connect. That is DNS
 * rebinding, and three hand-written guards in this repository were open to it
 * (fetch-attachment.ts even says so in a comment).
 *
 * This module resolves exactly once, inside the `lookup` callback that
 * `net.connect` uses to obtain the address it will connect to. There is no
 * second resolution to disagree with: the address we validate IS the address
 * the socket dials. A rebinding answer is either rejected here or connected to
 * here, never one and then the other.
 *
 * That is also why this is built on `node:http`/`node:https` rather than
 * `fetch()`. Global fetch is undici, which does not accept a `lookup` option
 * without constructing a custom `Agent` (and undici is not a dependency of this
 * repository). The `lookup` option on `http.request` is built in and passed
 * straight through to `net.connect`.
 *
 * ─── Why ipaddr.js ──────────────────────────────────────────────────────────
 *
 * The range list is the part worth getting wrong: this repository already has
 * three hand-written copies, and they disagree — one blocks multicast, another
 * does not; one blocks CGNAT, the others do not; none of them handle
 * `0177.0.0.1` or `::ffff:7f00:1`. ipaddr.js classifies an address against the
 * IANA special-purpose registries, so the policy here is default-DENY: an
 * address is allowed only if it classifies as `unicast`. A range we never
 * thought of is blocked by construction rather than by remembering it.
 *
 * ─── Redirects ──────────────────────────────────────────────────────────────
 *
 * Followed manually, at most MAX_REDIRECTS hops, each hop a fresh guarded
 * request. Verified: a server answering `302 Location: http://127.0.0.1:3001/`
 * gets the customer past a registration-time URL check, so validating only the
 * URL the customer typed is not enough.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import ipaddr from 'ipaddr.js';
import type { LookupAddress } from 'node:dns';

/** Hops followed before giving up. */
export const MAX_REDIRECTS = 3;

/** Default cap on the response body we will read into memory. */
export const DEFAULT_MAX_BYTES = 256 * 1024;

/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thrown when a URL is refused. Carries no resolved address and no range name:
 * the customer learns their URL is not reachable, not what our network looks
 * like. `hostname` is echoed back because they typed it themselves.
 */
export class BlockedUrlError extends Error {
  constructor(
    readonly reason: 'scheme' | 'address' | 'unresolvable' | 'redirects',
    readonly hostname: string,
    message: string,
  ) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

function schemeError(hostname: string): BlockedUrlError {
  return new BlockedUrlError('scheme', hostname, 'Only http:// and https:// URLs can be called.');
}

function addressError(hostname: string): BlockedUrlError {
  return new BlockedUrlError(
    'address',
    hostname,
    `The URL must resolve to a public internet address; "${hostname}" does not.`,
  );
}

/**
 * Is this a public unicast address we are willing to connect to?
 *
 * Default-deny: every range ipaddr.js does not call `unicast` is refused, which
 * covers loopback, private, link-local (and with it cloud metadata),
 * unspecified, carrier-grade NAT, broadcast, multicast and reserved — plus any
 * special-purpose range added to the registries later.
 */
export function isPublicAddress(ip: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    // Not an address we can reason about, so not one we will connect to.
    return false;
  }

  // ::ffff:127.0.0.1 is loopback wearing an IPv6 hat — classify the v4 inside.
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return isPublicAddress(v6.toIPv4Address().toString());
  }

  return parsed.range() === 'unicast';
}

/** Reject a URL whose scheme we do not speak. Cheap, and runs before any DNS. */
export function assertAllowedScheme(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw schemeError(url.hostname);
}

/** Decides whether a resolved address may be connected to. */
export type AddressPolicy = (ip: string) => boolean;

/**
 * Build a `lookup` implementation for net.connect that refuses addresses the
 * policy rejects.
 *
 * The policy is a parameter for one reason: a test server can only listen on
 * loopback, which the real policy blocks, so proving that redirects are
 * re-validated per hop is impossible without being able to allow the first hop.
 * Production code never passes one — `safeFetch` defaults to isPublicAddress,
 * and a caller that relaxes it has disabled the guard.
 *
 * net.connect may ask for one address or all of them depending on happy-eyeballs
 * settings, so both callback shapes are handled — and in the `all` case EVERY
 * returned address is validated, not just the first, because the socket may
 * fall back to any of them.
 */
export function makeGuardedLookup(isAllowed: AddressPolicy = isPublicAddress) {
  return function lookup(
    hostname: string,
    options: dns.LookupOneOptions | dns.LookupAllOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address?: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void {
    // A literal IP in the URL never reaches a resolver; check it directly.
    if (net.isIP(hostname)) {
      if (!isAllowed(hostname)) return callback(addressError(hostname));
      const family = net.isIPv6(hostname) ? 6 : 4;
      return (options as dns.LookupAllOptions).all
        ? callback(null, [{ address: hostname, family }])
        : callback(null, hostname, family);
    }

    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = addresses as LookupAddress[];
      if (!list || list.length === 0) {
        return callback(
          new BlockedUrlError('unresolvable', hostname, `Cannot resolve "${hostname}".`),
        );
      }
      // One bad answer poisons the set: if the socket could pick it, refuse.
      for (const a of list) {
        if (!isAllowed(a.address)) return callback(addressError(hostname));
      }
      return (options as dns.LookupAllOptions).all
        ? callback(null, list)
        : callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

/** The production lookup: only public unicast addresses. */
export const guardedLookup = makeGuardedLookup();

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Response bytes read before the socket is destroyed. */
  maxBytes?: number;
  /** Hops to follow. 0 disables redirect following entirely. */
  maxRedirects?: number;
  /** Test seam — see makeGuardedLookup. Leave unset in production. */
  addressPolicy?: AddressPolicy;
}

export interface SafeFetchResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Body decoded as UTF-8, truncated at maxBytes. */
  body: string;
  /** The same bytes undecoded — attachments and images must not go through UTF-8. */
  bytes: Buffer;
  /** True when the body hit the cap and was cut short. */
  truncated: boolean;
  /** Final URL after redirects — differs from the request URL when hops were followed. */
  url: string;
}

/** `new URL('http://[::1]/').hostname` keeps the brackets; net.isIP does not. */
function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

/** One guarded request, no redirect handling. */
function requestOnce(url: URL, opts: SafeFetchOptions): Promise<SafeFetchResponse> {
  const isAllowed = opts.addressPolicy ?? isPublicAddress;

  // A literal IP in the URL never reaches the resolver: net.connect sees
  // isIP(host) and dials straight through, so the `lookup` guard below is
  // never called. Measured — `http://127.0.0.1:<port>/` returned 200 through
  // the guarded transport until this check existed. No TOCTOU to worry about
  // here: with no name to resolve, what we check is what gets dialled.
  const literal = bareHost(url);
  if (net.isIP(literal) && !isAllowed(literal)) {
    return Promise.reject(addressError(url.hostname));
  }

  const transport = url.protocol === 'https:' ? https : http;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  return new Promise<SafeFetchResponse>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: opts.method ?? 'GET',
        headers: opts.headers,
        // The guard. net.connect calls this to get the address it will dial,
        // so there is no window between validating and connecting.
        //
        // Cast because @types/node declares LookupFunction with a REQUIRED
        // `address` argument, while every real dns.lookup callback — including
        // node's own — omits it on the error path. The shapes agree at runtime.
        lookup: (opts.addressPolicy
          ? makeGuardedLookup(opts.addressPolicy)
          : guardedLookup) as unknown as net.LookupFunction,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;

        res.on('data', (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            res.destroy();
            return;
          }
          chunks.push(c);
        });

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          const bytes = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: bytes.toString('utf8'),
            bytes,
            truncated,
            url: url.toString(),
          });
        };

        res.on('end', finish);
        // destroy() after the cap fires 'close' rather than 'end'.
        res.on('close', finish);
        res.on('error', reject);
      },
    );

    req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/**
 * Fetch a customer-supplied URL with the SSRF guard applied to every hop.
 *
 * Throws BlockedUrlError for a URL we refuse, and a plain Error for transport
 * failures (timeout, connection refused, TLS). Non-2xx is NOT an error — the
 * status is returned, because callers treat 4xx/5xx differently from a block.
 */
export async function safeFetch(
  rawUrl: string | URL,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('scheme', String(rawUrl), 'The URL is not valid.');
  }
  assertAllowedScheme(url);

  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  let current = url;

  for (let hop = 0; ; hop++) {
    const res = await requestOnce(current, opts);

    const location = res.headers.location;
    const isRedirect = res.status >= 300 && res.status < 400 && typeof location === 'string';
    if (!isRedirect) return res;

    if (hop >= maxRedirects) {
      throw new BlockedUrlError(
        'redirects',
        current.hostname,
        `The URL redirected more than ${maxRedirects} times.`,
      );
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new BlockedUrlError('scheme', current.hostname, 'The redirect target is not valid.');
    }
    // A redirect is a new destination chosen by the remote server, so it gets
    // the same scrutiny as the URL the customer typed — this is the hop that
    // slips past a registration-time check.
    assertAllowedScheme(next);
    current = next;
  }
}

/**
 * Validate a URL without fetching it, for save-time feedback.
 *
 * This is UX, not the security boundary: it tells the customer straight away
 * that their URL will never work. safeFetch re-checks at connect time, which
 * is what actually holds — a hostname that resolves publicly today can resolve
 * privately tomorrow.
 */
export async function assertUrlIsFetchable(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError('scheme', rawUrl, 'The URL is not valid.');
  }
  assertAllowedScheme(url);

  await new Promise<void>((resolve, reject) => {
    guardedLookup(bareHost(url), { all: true }, (err) => {
      // Only a blocked ADDRESS is a reason to refuse a registration. A name
      // that does not resolve yet is not: a staging endpoint may be registered
      // before it is deployed, and "cannot resolve" is not something safeFetch
      // blocks either — it would simply fail to connect. Refusing here would
      // reject a URL the delivery path considers perfectly legal.
      if (err instanceof BlockedUrlError && err.reason === 'address') return reject(err);
      return resolve();
    });
  });
}
