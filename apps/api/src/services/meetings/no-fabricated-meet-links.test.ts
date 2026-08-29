import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVideoLink } from './video-links.js';
import { SCAN_TIMEOUT_MS } from '../../test-support/scan-budget.js';

/**
 * EARLY WARNING — NOT A BARRIER.
 *
 * The barrier is that `createVideoLink` has no google_meet branch and the route
 * enum has no google_meet member. This file only notices if a link generator
 * comes back, and it notices by matching text.
 *
 * It used to read: a Meet code assembled from Math.random(), returned as
 * https://meet.google.com/<code>, stored on a booking marked confirmed. Nothing
 * had ever spoken to Google.
 *
 * What it will NOT see, spelled out because two scan tests in this repo have
 * already passed green through a deliberately reintroduced bug:
 *   - a URL assembled from pieces: 'https://meet' + '.google.com/' + code
 *   - a different fabricated host — Jitsi, Whereby, a self-hosted meet domain
 *   - a code generator that stores the URL somewhere other than a return value
 *   - anything outside apps/api/src, and any test file
 *   - the `location_type` column default in db/schema/booking-pages.ts, which
 *     still reads 'google_meet'. Unreachable through the API — the route schema
 *     always supplies a value — but this scan does not cover it.
 *
 * A green run means "this spelling did not come back in this directory".
 */

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const toPosix = (p: string): string => p.split(sep).join('/');
/**
 * The code part of a line: '' for a comment line, and a trailing double-slash
 * comment removed — but NOT the double slash inside a URL scheme. The first
 * draft cut there, so the one line it existed to catch turned into
 * "return https:" and matched nothing. The self-test below is the only reason
 * that surfaced.
 */
function codeOf(line: string): string {
  const t = line.trim();
  if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) return '';
  const i = line.search(/(?<!:)[/][/]/);
  return i === -1 ? line : line.slice(0, i);
}

/** A line that builds a meet.google.com URL. */
function fabricatesMeetLink(rawLine: string): boolean {
  return codeOf(rawLine).includes('meet.google.com');
}

/** A line that generates a random Meet-shaped code. */
function generatesMeetCode(rawLine: string): boolean {
  return /generateMeetCode|meetCode/.test(codeOf(rawLine));
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

describe('no fabricated Google Meet links', () => {
  const files = sourceFiles(SRC);

  it('scans a non-empty corpus, so a green run is not green-by-emptiness', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('recognises the shapes it claims to, so a green run is not green-by-typo', () => {
    expect(fabricatesMeetLink('  return `https://meet.google.com/${meetCode}`;')).toBe(true);
    expect(generatesMeetCode('  const meetCode = generateMeetCode();')).toBe(true);
    expect(generatesMeetCode('function generateMeetCode(): string {')).toBe(true);
    // A comment describing the deleted code is history, not a generator.
    expect(fabricatesMeetLink(' * https://meet.google.com/<random>. The booking was then')).toBe(
      false,
    );
    expect(fabricatesMeetLink('  const url = joinUrl;')).toBe(false);
    expect(
      fabricatesMeetLink('  const x = 1; // meet.google.com used to be built here'),
      'a trailing comment is not a generator',
    ).toBe(false);
    expect(generatesMeetCode('  const code = randomUUID();')).toBe(false);
  });

  it(
    'no source file builds a meet.google.com URL or a Meet code',
    () => {
      const hits: string[] = [];
      for (const file of files) {
        const lines = readFileSync(file, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!.replace(/\r$/, '');
          if (fabricatesMeetLink(line) || generatesMeetCode(line)) {
            hits.push(`${toPosix(relative(SRC, file))}:${i + 1}  ${line.trim()}`);
          }
        }
      }
      expect(
        hits,
        'a Meet link nobody created is a confirmed booking the invitee cannot join',
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it('createVideoLink returns nothing for google_meet', async () => {
    // Not merely absent from the enum: the function itself has no branch, so a
    // row that still carries the old value cannot produce a link either.
    await expect(
      createVideoLink('google_meet', {
        title: 'x',
        startAt: new Date(),
        endAt: new Date(),
        hostUserId: 'u',
        inviteeEmail: 'a@example.test',
      }),
    ).resolves.toBeNull();
  });
});
