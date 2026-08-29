import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCAN_TIMEOUT_MS } from '../test-support/scan-budget.js';

/**
 * EARLY WARNING — NOT A BARRIER.
 *
 * The barrier is `config/env.ts`: the system sender is a required, validated
 * field, so a missing, empty or malformed value stops the process at boot. This
 * file only notices if someone reintroduces the shape that made the old bug
 * possible — a raw `process.env` read of a system-sender name, or one of the
 * four committed fallback addresses — and it notices by matching text.
 *
 * What it will NOT see, stated plainly so nobody reads a green run as proof:
 *   - dynamic access: `process.env[name]`, destructuring, `Object.entries`
 *   - a NEW spelling. It knows the six names that existed; a seventh
 *     (`MAIL_FROM_ADDRESS`, say) is invisible until someone adds it here.
 *   - a hardcoded address that is not one of the four listed below
 *   - anything outside apps/api/src — workers, engine, web, compose, k8s, CI
 *   - test files, which are skipped: setting process.env in a test is not the
 *     defect this looks for
 *   - a call site that reads the value from config and then overrides it later
 *
 * A green run means "this one old shape did not come back in this one
 * directory". It does not mean system mail is correctly configured.
 *
 * Matching is deliberately regex-free. The first draft of this file used
 * `new RegExp(`process\.env\.(...)\b`)` in a template literal, where the
 * word-boundary escape is parsed as a backspace character: the pattern matched
 * nothing and the test reported green through a deliberate reintroduction of
 * the bug. A silent pass in the file whose job is to warn is worse than no file.
 */

const FAMILY = [
  'SYSTEM_EMAIL_FROM',
  'SYSTEM_EMAIL_FROM_NAME',
  'SYSTEM_FROM_EMAIL',
  'DOI_FROM_EMAIL',
  'DOI_FROM_DOMAIN',
  'REPORTS_FROM_EMAIL',
] as const;

/** The fallbacks that used to ship: four addresses across four domains. */
const RETIRED_ADDRESSES = [
  'no-reply@example.com',
  'noreply@forgemsg.com',
  'no-reply@forgemsg.io',
  'reports@forgemsg.com',
] as const;

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const toPosix = (p: string): string => p.split(sep).join('/');

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const LOCAL_PART_CHAR = /[A-Za-z0-9._%+-]/;

/**
 * Occurrences of `needle` in `src` that are not part of a longer token.
 *
 * `before` guards the left edge (so `dmarc-reports@forgemsg.com` does not count
 * as `reports@forgemsg.com`), `after` the right edge (so `SYSTEM_EMAIL_FROM`
 * does not count a hit inside `SYSTEM_EMAIL_FROM_NAME`).
 */
function countWholeTokens(src: string, needle: string, before: RegExp, after?: RegExp): number {
  let hits = 0;
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) {
    const prev = i === 0 ? '' : src[i - 1]!;
    const next = src[i + needle.length] ?? '';
    if (prev !== '' && before.test(prev)) continue;
    if (after && next !== '' && after.test(next)) continue;
    hits++;
  }
  return hits;
}

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

describe('system sender — early warning (not a barrier)', () => {
  const files = sourceFiles(SRC);

  it('scans a non-empty corpus, so a green run is not green-by-emptiness', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('detects the shape it is looking for, so a green run is not green-by-typo', () => {
    // The matcher, exercised against text that definitely contains the pattern.
    // Without this the file could go quietly blind — and did, once.
    const planted = "const x = process.env.DOI_FROM_EMAIL ?? 'no-reply@example.com';";
    expect(countWholeTokens(planted, 'process.env.DOI_FROM_EMAIL', IDENTIFIER_CHAR)).toBe(1);
    expect(countWholeTokens(planted, 'no-reply@example.com', LOCAL_PART_CHAR)).toBe(1);
    expect(
      countWholeTokens(
        'process.env.SYSTEM_EMAIL_FROM_NAME',
        'process.env.SYSTEM_EMAIL_FROM',
        IDENTIFIER_CHAR,
        IDENTIFIER_CHAR,
      ),
      'a hit inside a longer name is not a hit',
    ).toBe(0);
    expect(
      countWholeTokens('dmarc-reports@forgemsg.com', 'reports@forgemsg.com', LOCAL_PART_CHAR),
      'a hit inside a longer address is not a hit',
    ).toBe(0);
  });

  it(
    'no source file reads a system-sender name off process.env',
    () => {
      const hits: string[] = [];
      for (const file of files) {
        const src = readFileSync(file, 'utf8');
        for (const name of FAMILY) {
          const needle = 'process.env.' + name;
          if (countWholeTokens(src, needle, IDENTIFIER_CHAR, IDENTIFIER_CHAR) > 0) {
            hits.push(toPosix(relative(SRC, file)) + ': ' + needle);
          }
        }
      }
      expect(
        hits,
        'read it from `env` in config/env.ts instead — a raw process.env read is ' +
          'unvalidated, and `??` does not treat an empty string as absent, so a ' +
          'set-but-empty variable sends an empty From rather than the fallback',
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    'no source file carries one of the retired fallback addresses',
    () => {
      const hits: string[] = [];
      for (const file of files) {
        // config/env.ts names them in a comment on purpose — that is history, not
        // a fallback. Guessing "comment vs code" for every file would be less
        // honest than skipping the one file by name.
        if (toPosix(relative(SRC, file)) === 'config/env.ts') continue;
        const src = readFileSync(file, 'utf8');
        for (const address of RETIRED_ADDRESSES) {
          if (countWholeTokens(src, address, LOCAL_PART_CHAR) > 0) {
            hits.push(toPosix(relative(SRC, file)) + ': ' + address);
          }
        }
      }
      expect(hits, 'system mail has one sender and it comes from config').toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
