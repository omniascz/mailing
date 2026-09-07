/**
 * No committed literal names a domain we do not own.
 *
 * Three families were in the tree and none of them is registered to anyone:
 * `forgemsg.com`, `forgemsg.io` and `mailforge.io`. They were not decorative.
 * They were the right-hand side of every Message-ID, the mailbox in every
 * List-Unsubscribe, the EHLO name the engine gives, and the SPF include and
 * Return-Path target printed in the DNS instructions a customer copies into
 * their own zone. `mailforge.io` was the most dangerous of the three, because
 * it matches the product's name closely enough to be mistaken for real.
 *
 * They are replaced by `example.invalid`. RFC 2606 reserves `.invalid` so it
 * can never resolve — which is the whole point, and the difference from #85: a
 * placeholder that looks like it works is the one that gets deployed.
 *
 * ─── WHAT THIS TEST DOES NOT SEE ─────────────────────────────────────────────
 *
 * Read this before trusting a green run.
 *
 *  - It reads only files git tracks, from `git ls-files`. An untracked file,
 *    anything ignored, and anything under node_modules is invisible to it.
 *  - It matches whole literals only. A domain assembled at runtime —
 *    `'forgemsg' + '.com'`, or a template hole — is not found. Nor is one
 *    written inside a regular expression, where the dot is escaped:
 *    `/mailforge\.io/` reads as `mailforge\.io` in the file and the scan walks
 *    past it. One such assertion existed, in the marketing-blog seed test, and
 *    it was caught by that test failing rather than by this one.
 *  - It says nothing about the product NAME. "ForgeMsg" still appears about a
 *    thousand times in comments, tests, fixtures and the `X-ForgeMsg-*` wire
 *    headers, and that is deliberate: those headers are a published contract
 *    customers compute HMACs over, and the npm scope `@forgemsg/*` is internal.
 *    Renaming either is a different change with different risk.
 *  - It does not check that `example.invalid` is ABSENT from anywhere. It is
 *    supposed to be there; the point is that nothing else is.
 *  - It cannot tell a live value from a comment. A domain mentioned while
 *    explaining something is reported the same as one in a header.
 *
 * ─── WHY THE MATCHER IS SELF-TESTED ──────────────────────────────────────────
 *
 * A scan test that finds nothing is indistinguishable from a scan test that
 * looks nowhere, and in this repo that has happened seven times. So the matcher
 * is run against strings whose answer is known, in the same process, before it
 * is trusted on the tree — and the file list is asserted non-empty, because an
 * empty list is the other way this passes for the wrong reason.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The forbidden literals.
 *
 * Written as an alternation of whole hostnames rather than with `\b`, because
 * `\b` in a shell heredoc has arrived as a literal backspace in this repo three
 * times. This file is written by an editor and read by vitest; there is no
 * shell in the path, and the boundaries are spelled out as character classes so
 * the pattern does not depend on one.
 *
 * The lookbehind excludes letters, digits and hyphen but NOT the dot. A dot in
 * front means a subdomain of the forbidden domain, and `app.forgemsg.io` is
 * exactly as unregistered as `forgemsg.io`. The first version of this pattern
 * excluded the dot too, and the tree scan was GREEN with it — because by then
 * every literal left in the tree had a subdomain in front. The self-test below
 * is what caught it, which is the entire argument for having one.
 */
const FORBIDDEN = /(?<![A-Za-z0-9-])(?:forgemsg|mailforge)\.(?:com|io)(?![A-Za-z0-9-])/i;

/** Repo root: this file is apps/api/src/config/, so four levels up. */
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

/** Binary-ish and generated paths that would only add noise. */
const SKIP = /(^|\/)(pnpm-lock\.yaml|.*\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|zip))$/i;

describe('the matcher, before it is trusted on the tree', () => {
  it('finds every forbidden host, in the shapes they actually appeared in', () => {
    const mustMatch = [
      'forgemsg.com',
      'forgemsg.io',
      'mailforge.io',
      'mailforge.com',
      'https://app.forgemsg.io',
      'dmarc-reports@forgemsg.com',
      '<mailto:unsubscribe@forgemsg.com?subject=x>',
      'spf.forgemsg.com',
      'mta.FORGEMSG.COM',
      'hostname := "mta.forgemsg.com"',
      'postgres.internal.mailforge.io:5432',
    ];
    for (const s of mustMatch) {
      expect(FORBIDDEN.test(s), `matcher missed: ${s}`).toBe(true);
    }
  });

  it('does not fire on things that merely look similar', () => {
    const mustNotMatch = [
      // The npm scope and package names stay, and must not be swept up.
      '@forgemsg/api',
      '@forgemsg/shared/redis',
      'pnpm --filter @forgemsg/api seed',
      // The product name on its own is not a domain.
      'ForgeMsg/1.0',
      'X-ForgeMsg-Signature',
      'MailForge',
      // The replacement itself.
      'example.invalid',
      'spf.example.invalid',
      // Other TLDs are somebody else's problem, not this test's.
      'forgemsg.cz',
      'mailforge.dev',
      // Boundaries: a longer label either side must not match.
      'notforgemsg.com',
      'forgemsg.community',
      'xforgemsg.io',
      'forgemsg.iotest',
    ];
    for (const s of mustNotMatch) {
      expect(FORBIDDEN.test(s), `matcher false-positived on: ${s}`).toBe(false);
    }
  });

  it('is looking at a real, non-empty file list', () => {
    const files = trackedFiles();
    // An empty or tiny list is the other way this test passes for the wrong
    // reason — a wrong cwd, or git not on PATH.
    expect(files.length, 'git ls-files returned almost nothing').toBeGreaterThan(500);
    expect(files, 'the file list does not contain this test itself').toContain(
      'apps/api/src/config/fictional-domain-scan.test.ts',
    );
  });

  it('actually reads the files it lists', () => {
    // Proves the read path works: this file contains the literals above, in
    // the mustMatch list, so scanning it must produce hits.
    const self = 'apps/api/src/config/fictional-domain-scan.test.ts';
    const body = readFileSync(path.join(REPO_ROOT, self), 'utf8');
    expect(FORBIDDEN.test(body), 'the scanner cannot read its own fixtures').toBe(true);
  });
});

describe('the tree', () => {
  it('has no committed literal naming a domain we do not own', () => {
    const offenders: string[] = [];
    const self = path.join('apps', 'api', 'src', 'config', 'fictional-domain-scan.test.ts');

    for (const rel of trackedFiles()) {
      if (SKIP.test(rel)) continue;
      // This file carries the literals on purpose, in its own fixtures.
      if (path.normalize(rel) === self) continue;

      const abs = path.join(REPO_ROOT, rel);
      let body: string;
      try {
        if (statSync(abs).size > 4 * 1024 * 1024) continue;
        body = readFileSync(abs, 'utf8');
      } catch {
        continue; // deleted between listing and reading, or unreadable
      }
      if (!FORBIDDEN.test(body)) continue;

      body.split(/\r?\n/).forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }

    expect(
      offenders,
      `Committed literals name a domain nobody owns. Use example.invalid, or a configured value:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
