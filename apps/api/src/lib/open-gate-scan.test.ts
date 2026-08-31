import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCAN_TIMEOUT_MS } from '../test-support/scan-budget.js';

/**
 * EARLY WARNING — NOT A BARRIER.
 *
 * The barriers are the gates themselves: three endpoints refuse when their
 * secret is missing, six more are not served at all. This file only notices if
 * the shape that produced those holes reappears in a file that verifies
 * something, and it notices by matching text on a handful of known spellings:
 *
 *     if (!secret) return true;
 *     if (secret) { …verify… }
 *     if (secret && !verify(…)) { …reject… }
 *
 * What it will NOT see, spelled out so a green run is not mistaken for a
 * guarantee:
 *
 *   - bracket notation. `process.env['META_APP_SECRET']` in webhooks/meta.ts
 *     was invisible to the scan that found the others, which is why the list
 *     below is keyed on the LOCAL variable, not on the env read. A local named
 *     something else — `cfg.k`, `s`, `auth` — is invisible again.
 *   - a secret read through a config object, a function call, or destructuring
 *   - the same logic written as a ternary, an early `return`, an `||`, or
 *     spread across two statements
 *   - anything outside apps/api/src, and any test file
 *
 * A green run means "these spellings did not come back in this directory". It
 * does not mean every inbound request is verified.
 */

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const toPosix = (p: string): string => p.split(sep).join('/');

/**
 * Files this scan does not look at.
 *
 * An entry here is a hole in the scan, so each one has to still be earning it.
 * Three were not: `routes/v1/integrations/calendly.ts`,
 * `routes/v1/ecommerce-integrations.ts` and `services/phone/voip.ts` were
 * listed as "open at the time of writing" — but the commit that added this
 * list, da2ee00, is also the commit that closed them, so the exemptions were
 * stale on the day they were written. All three fail closed today: the first
 * two through `checkWebhookSignature`, and voip.ts by throwing when either the
 * signature or the auth token is missing. Measured one at a time, by deleting
 * the entry and running this file: each stayed green, so nothing was holding
 * the exemption up.
 *
 * That is not a cosmetic difference. While a file sits in this set the scan
 * skips it entirely (`if (KNOWN_OPEN.has(rel)) continue`), so had any of the
 * three regressed to an open gate, this test would have stayed green and said
 * so. The exemption outliving the gap is the failure mode worth naming: it
 * reads as a known gap and behaves as an unwatched file.
 *
 * What is left is deliberate and still true. The Meta-family verifiers keep
 * their open shape on purpose — the endpoints are switched off in
 * lib/webhook-switches.ts rather than repaired — and deleting any of these
 * four does turn this test red, which is what keeps this list honest.
 */
const KNOWN_OPEN = new Set([
  'lib/meta-signature.ts',
  'routes/v1/webhooks/meta.ts',
  'routes/v1/webhooks/instagram.ts',
  'routes/v1/webhooks/messenger.ts',
]);

/** Identifiers that name a secret. Deliberately narrow — see the header. */
const SECRETISH = /(secret|signingkey|apptoken|publickey|authtoken)/i;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') sourceFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A trailing line comment is stripped first. The real occurrence reads
 * `if (!appSecret) return true; // not configured (dev) — open`, and a matcher
 * anchored at end-of-line missed exactly that. The self-test below is the only
 * reason this file is not silently blind to the line it was written for.
 */
const stripComment = (line: string): string => line.split('//')[0]!.trimEnd();

function openReturnTrue(rawLine: string, rawNext: string): boolean {
  const line = stripComment(rawLine);
  const next = stripComment(rawNext);
  const m = /^\s*if \(!\s*([A-Za-z_.[\]'"]+)\s*\)\s*(return true;?)?\s*$/.exec(line);
  if (!m || !SECRETISH.test(m[1]!)) return false;
  return /return true/.test(line) || /^\s*return true;?\s*$/.test(next);
}

/** `if (<secretish> && !verify…)` — verification only when configured. */
function openAndGuard(rawLine: string, rawNext: string): boolean {
  const line = stripComment(rawLine);
  const next = stripComment(rawNext);
  const m =
    /^\s*if \(\s*([A-Za-z_.[\]'"?]+)\s*&&\s*$/.exec(line) ??
    /^\s*if \(\s*([A-Za-z_.[\]'"?]+)\s*&&\s*!/.exec(line);
  if (!m || !SECRETISH.test(m[1]!)) return false;
  return /!\s*[A-Za-z_.]*(verify|check|valid)/i.test(line + next);
}

describe('inbound gates — early warning (not a barrier)', () => {
  const files = sourceFiles(SRC);

  it('scans a non-empty corpus, so a green run is not green-by-emptiness', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('recognises the shapes it claims to, so a green run is not green-by-typo', () => {
    expect(openReturnTrue('  if (!appSecret) return true; // dev', '')).toBe(true);
    expect(
      openReturnTrue('  if (!appSecret) return true; // not configured (dev)', ''),
      'the real line carries a trailing comment; anchoring at EOL missed it',
    ).toBe(true);
    expect(openReturnTrue('  if (!appSecret)', '    return true;')).toBe(true);
    expect(openReturnTrue('  if (!rows) return true;', '')).toBe(false);
    expect(
      openAndGuard('      if (creds.webhookSecret &&', '        !verifyShopifyWebhook(a, b, c)'),
    ).toBe(true);
    expect(
      openAndGuard('      if (appSecret && !verifyInstagramWebhook(raw, sig, appSecret)) {', ''),
    ).toBe(true);
    expect(openAndGuard('      if (conn.expiresAt && !isStale(conn)) {', '')).toBe(false);
  });

  it(
    'no verifying file reopens a gate on a missing secret',
    () => {
      const hits: string[] = [];
      for (const file of files) {
        const rel = toPosix(relative(SRC, file));
        if (KNOWN_OPEN.has(rel)) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!.replace(/\r$/, '');
          const next = (lines[i + 1] ?? '').replace(/\r$/, '');
          if (openReturnTrue(line, next) || openAndGuard(line, next)) {
            hits.push(`${rel}:${i + 1}  ${line.trim()}`);
          }
        }
      }
      expect(
        hits,
        'a missing secret must refuse the request, not skip the check — if a dev ' +
          'path is wanted, gate it on an explicit flag the way lib/webhook-switches.ts does',
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
