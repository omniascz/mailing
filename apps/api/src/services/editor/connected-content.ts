/**
 * Connected Content — Liquid HTTP fetch (§9 P1).
 *
 * Lets templates pull JSON from a customer-allowed URL at render time
 * and expose the parsed body as a Liquid variable. Mirrors the Iterable
 * + Braze "Connected Content" tag, which lets marketers personalise
 * email bodies with external data (weather, inventory, A/B variants,
 * recommendations served from the customer's own API).
 *
 * Usage in a template body:
 *   {% connected_content "https://api.example.com/products/123" as product %}
 *   <p>{{ product.title }} costs {{ product.price }}.</p>
 *
 * Safety rails — these are non-negotiable, the tag is internet-facing:
 *
 *   1. Allow-list of hosts (per-org `connectedContentHosts` setting)
 *   2. Hard 5-second request timeout
 *   3. Response body capped at 100 KB
 *   4. http(s) only, no file://, ftp://, etc.
 *   5. Private / loopback / link-local IPs blocked at DNS resolution
 *   6. JSON content-type required; HTML/script bodies refused
 *   7. No auth headers — Connected Content does not surface tokens
 *      out of the platform
 *   8. No follow on redirects to disallowed hosts (re-checked per hop)
 *
 * Failures are non-fatal: a request that times out or returns garbage
 * resolves to an empty object so the template still renders. That keeps
 * a flaky third-party API from blocking a whole campaign.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export interface ConnectedContentOptions {
  url: string;
  allowedHosts: string[];
  timeoutMs?: number;
  maxBytes?: number;
  /** Override fetch for tests. */
  fetchImpl?: typeof globalThis.fetch;
}

export interface ConnectedContentResult {
  data: unknown;
  ok: boolean;
  reason: 'fetched' | 'host_blocked' | 'private_ip' | 'timeout' | 'too_large' | 'invalid_content' | 'http_error' | 'invalid_url';
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 100 * 1024;

function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const a = parts[0]!;
    const b = parts[1]!;
    if (a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower === '::') return true;
  return false;
}

export function isHostAllowed(host: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  // `new URL('http://[::1]/').hostname` keeps the brackets; strip them so
  // 'fe80::1' (in allow list) matches '[fe80::1]' (from URL).
  const lower = host.toLowerCase().replace(/^\[|\]$/g, '');
  for (const a of allowed) {
    const al = a.toLowerCase();
    if (al.startsWith('*.')) {
      const suffix = al.slice(2);
      if (lower.endsWith(`.${suffix}`)) return true;
      // Wildcard MUST NOT match the apex.
      continue;
    }
    if (lower === al) return true;
  }
  return false;
}

/** Pure URL validator — exported for tests. */
export function parseConnectedUrl(input: string): URL | null {
  try {
    const u = new URL(input);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

async function resolveAndCheck(hostname: string): Promise<boolean> {
  // Allow literal IPs in URL — still need to check they aren't private.
  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }
  try {
    const records = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);
    const ips: string[] = [];
    for (const r of records) {
      if (r.status === 'fulfilled') ips.push(...r.value);
    }
    if (ips.length === 0) return false;
    return ips.every((ip) => !isPrivateIp(ip));
  } catch {
    return false;
  }
}

export async function fetchConnectedContent(
  opts: ConnectedContentOptions,
): Promise<ConnectedContentResult> {
  const url = parseConnectedUrl(opts.url);
  if (!url) return { data: {}, ok: false, reason: 'invalid_url' };

  if (!isHostAllowed(url.hostname, opts.allowedHosts)) {
    return { data: {}, ok: false, reason: 'host_blocked' };
  }
  if (!(await resolveAndCheck(url.hostname))) {
    return { data: {}, ok: false, reason: 'private_ip' };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      // Redirects are dangerous — host re-validation would be needed and the
      // tag intent is "fetch this exact URL". Refuse to follow.
      return { data: {}, ok: false, reason: 'http_error' };
    }
    if (!res.ok) return { data: {}, ok: false, reason: 'http_error' };

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) {
      return { data: {}, ok: false, reason: 'invalid_content' };
    }

    // Stream-cap the body so a malicious endpoint serving a 50 GB stream
    // doesn't blow the worker.
    const reader = res.body?.getReader();
    if (!reader) return { data: {}, ok: false, reason: 'http_error' };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { data: {}, ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf-8');
    try {
      return { data: JSON.parse(text), ok: true, reason: 'fetched' };
    } catch {
      return { data: {}, ok: false, reason: 'invalid_content' };
    }
  } catch (err) {
    const message = (err as { name?: string }).name ?? '';
    if (message.includes('Abort') || message.includes('Timeout')) {
      return { data: {}, ok: false, reason: 'timeout' };
    }
    return { data: {}, ok: false, reason: 'http_error' };
  }
}
