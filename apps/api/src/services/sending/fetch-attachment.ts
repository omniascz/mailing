/**
 * Fetch a remote attachment by URL, with SSRF safeguards, for the Resend-style
 * `path` attachment field. HTTPS only, private/loopback/link-local IPs blocked,
 * size-capped, timed out. Returns base64 content for the MTA job.
 */

import dnsPromises from 'node:dns/promises';
import { AppError } from '../../lib/app-error.js';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 10_000;

/**
 * Pure: is this IP in a private / loopback / link-local / reserved range that a
 * server-side fetch must not reach (SSRF guard)? Handles IPv4, IPv6, and
 * IPv4-mapped IPv6.
 */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.toLowerCase().trim();

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) → test the embedded v4.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]!);

  if (addr.includes(':')) {
    // IPv6
    if (addr === '::1' || addr === '::') return true;
    if (addr.startsWith('fe80')) return true; // link-local
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique-local fc00::/7
    return false;
  }

  const parts = addr.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

export interface FetchedAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

/**
 * Fetch + validate a remote attachment. Throws AppError on a disallowed URL,
 * SSRF-blocked host, oversize body, or fetch failure.
 * Note: pre-connect DNS check does not fully close DNS-rebinding; combined with
 * https-only + size/time caps it is a reasonable safeguard.
 */
export async function fetchRemoteAttachment(
  rawUrl: string,
  fallbackName?: string,
): Promise<FetchedAttachment> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw AppError.badRequest(`Invalid attachment url: ${rawUrl}`);
  }
  if (url.protocol !== 'https:') {
    throw AppError.badRequest('Attachment url must be https');
  }

  // SSRF: resolve every A/AAAA and block if any is private/reserved.
  const resolved = await dnsPromises.lookup(url.hostname, { all: true }).catch(() => []);
  if (resolved.length === 0) throw AppError.badRequest(`Cannot resolve attachment host: ${url.hostname}`);
  if (resolved.some((r) => isPrivateIp(r.address))) {
    throw AppError.badRequest('Attachment url resolves to a disallowed (private) address');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!res.ok) throw AppError.badRequest(`Attachment fetch failed (${res.status})`);

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared && declared > MAX_BYTES) {
      throw AppError.badRequest(`Attachment too large (>${MAX_BYTES} bytes)`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      throw AppError.badRequest(`Attachment too large (>${MAX_BYTES} bytes)`);
    }

    const filename =
      fallbackName || decodeURIComponent(url.pathname.split('/').pop() || '') || 'attachment';
    const contentType =
      res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
    return { filename, contentType, contentBase64: buf.toString('base64') };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest(`Attachment fetch error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
