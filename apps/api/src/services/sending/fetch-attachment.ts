/**
 * Fetch a remote attachment by URL, with SSRF safeguards, for the Resend-style
 * `path` attachment field. HTTPS only, private/loopback/link-local IPs blocked,
 * size-capped, timed out. Returns base64 content for the MTA job.
 */

import { AppError } from '../../lib/app-error.js';
import { safeFetch, isPublicAddress, BlockedUrlError } from '../../lib/safe-fetch.js';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 10_000;

/**
 * Kept as a named re-export because callers and tests import it from here.
 * The implementation moved to lib/safe-fetch: the copy that used to live here
 * was a hand-written range list, and its own docstring admitted the
 * resolve-then-fetch shape did not close DNS rebinding. It does now, because
 * the check runs inside the socket's lookup rather than before the fetch.
 */
export function isPrivateIp(ip: string): boolean {
  return !isPublicAddress(ip);
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // redirect following is disabled: an attachment URL has no business
    // bouncing, and every hop would be another chance to land somewhere else.
    const res = await safeFetch(url, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      maxRedirects: 0,
    });
    if (res.status < 200 || res.status >= 300) {
      throw AppError.badRequest(`Attachment fetch failed (${res.status})`);
    }
    if (res.truncated) {
      throw AppError.badRequest(`Attachment too large (>${MAX_BYTES} bytes)`);
    }
    const buf = res.bytes;

    const filename =
      fallbackName || decodeURIComponent(url.pathname.split('/').pop() || '') || 'attachment';
    const contentType =
      String(res.headers['content-type'] ?? '')
        .split(';')[0]
        ?.trim() || 'application/octet-stream';
    return { filename, contentType, contentBase64: buf.toString('base64') };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof BlockedUrlError) throw AppError.badRequest(err.message);
    throw AppError.badRequest(`Attachment fetch error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
