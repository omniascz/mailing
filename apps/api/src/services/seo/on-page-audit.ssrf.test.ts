/**
 * The SEO auditor and the CDP webhook activation both fetch a URL the caller
 * chose, and both did it with a bare global `fetch()`.
 *
 * That is the SSRF shape lib/safe-fetch.ts was written for, and the reason a
 * hand-rolled check is not a substitute is spelled out in that module: with
 * `fetch()` the hostname is resolved a second time inside the socket layer, so
 * a check performed beforehand can be answered differently at connect time.
 * Seven services already route through the guard; these two did not.
 *
 * The audit case is the sharper of the two because it is a READ: the handler
 * returns the page's title, meta description and H1s to the caller, so
 * `http://169.254.169.254/latest/meta-data/` is an exfiltration channel, not
 * just a blind request.
 *
 * These run in the unit suite. They need no database — `auditUrl` is refused
 * before it reaches the persistence step, which is the whole claim.
 */
import { describe, it, expect, vi } from 'vitest';
import { auditUrl } from './on-page-audit.js';
import { deliverWebhook } from '../cdp/activation.js';

/**
 * Addresses an outbound fetch from this process must never dial. Not a copy of
 * the range list — lib/safe-fetch.test.ts owns that — just the handful whose
 * reachability from these two call sites is the actual finding.
 */
const FORBIDDEN: Array<[label: string, url: string]> = [
  ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
  ['loopback, the API itself', 'http://127.0.0.1:3001/api/v1/internal/contacts/batch'],
  ['loopback by name', 'http://localhost:3001/'],
  ['private 10/8', 'http://10.0.0.1/'],
  ['private 192.168/16', 'http://192.168.1.1/admin'],
  ['IPv6 loopback', 'http://[::1]:3001/'],
  ['IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/'],
];

describe('auditUrl refuses private destinations', () => {
  it.each(FORBIDDEN)('refuses %s', async (_label, url) => {
    // A guarded refusal is a 400 AppError carrying the guard's wording. The
    // failure mode this catches is not "it threw" — an unguarded fetch to a
    // closed port throws too — so the message is asserted, and a real
    // connection attempt is ruled out below.
    await expect(auditUrl('org-does-not-matter', url)).rejects.toThrow(
      /must resolve to a public internet address/i,
    );
  });

  it('never reaches global fetch for a blocked URL', async () => {
    // Before the fix this spy recorded the call. safeFetch is built on
    // node:http, not undici, so a green run here means the request never
    // started rather than that it started and failed.
    const spy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(auditUrl('org', 'http://169.254.169.254/')).rejects.toThrow();
      expect(spy, 'the audit must not call global fetch at all').not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses a non-http scheme before any DNS happens', async () => {
    await expect(auditUrl('org', 'file:///etc/passwd')).rejects.toThrow(
      /Only http:\/\/ and https:\/\/ URLs/i,
    );
    await expect(auditUrl('org', 'gopher://127.0.0.1/')).rejects.toThrow(
      /Only http:\/\/ and https:\/\/ URLs/i,
    );
  });

  it('refuses a URL that is not a URL', async () => {
    await expect(auditUrl('org', 'not a url at all')).rejects.toThrow(/not valid|public internet/i);
  });
});

describe('CDP activation webhook refuses private destinations', () => {
  it.each(FORBIDDEN)('refuses %s', async (_label, url) => {
    await expect(deliverWebhook({ url }, [{ email: 'a@b.test' }], 'upsert')).rejects.toThrow(
      /must resolve to a public internet address/i,
    );
  });

  it('still rejects a missing url the same way it always did', async () => {
    await expect(deliverWebhook({}, [], 'upsert')).rejects.toThrow(/config\.url/);
  });
});
