import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCAN_TIMEOUT_MS } from '../test-support/scan-budget.js';

/**
 * Nothing in this package may hold a portal open across a round trip.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * db/stuck-connection-reaper.ts terminates any backend of our pool that has
 * been `state = 'active'` with `wait_event = 'Client/ClientRead'` for longer
 * than the threshold. Its whole safety argument is that no healthy client ever
 * sits there: a slow query waits on IO, on a lock or on the CPU, never on the
 * client. That is what lets the threshold be short without being weighed
 * against the slowest legitimate query.
 *
 * There are exactly two ways to break that argument, and both are client-side
 * APIs rather than anything the database decides:
 *
 *   sql`…`.cursor(n, fn)   keeps a portal open and fetches batch by batch. The
 *                          backend is active and waiting on us between batches.
 *   sql`copy …`.writable() COPY FROM STDIN. Same state, for as long as the
 *   sql`copy …`.readable() stream is open.
 *
 * Either one, on the pool the watchdog polices, would be reaped as if it were
 * wedged — a working feature killed by a safety net. So the rule is not "be
 * careful with cursors", it is "there are none", and this is what makes that
 * fail loudly the day someone adds one. If a cursor is ever genuinely needed,
 * the fix is a separate pool with its own `application_name`, which the
 * watchdog does not look at — not an exemption here.
 *
 * ─── WHAT THIS SCAN CANNOT SEE ───────────────────────────────────────────────
 *
 *   - Anything outside apps/api/src. apps/workers opens its own pool and is not
 *     scanned; it is also not watched by this reaper, so it is out of scope
 *     both ways. If the reaper is ever started there, this scan does not follow.
 *   - A call assembled at runtime: `sql[method](…)`, or a helper in a
 *     dependency that opens a cursor on a connection we handed it. This matches
 *     source text in this package only.
 *   - `drizzle-orm` internals. Drizzle does not use portals for the query
 *     builder, but this scan reads our source, not node_modules.
 *   - Whether the reaper is actually running. That is the integration test's
 *     job (integration/stuck-connection-reaper.integration.test.ts).
 *   - A cursor held on a *different* pool with a different `application_name`,
 *     which is legal by design. The matcher cannot tell the pools apart, so
 *     such a case would have to be added to ALLOWED with a reason.
 */

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * The two files allowed to contain the shape.
 *
 * The integration test synthesises the wedge in order to prove the watchdog
 * clears it, on a pool it opens and terminates itself. This file holds the
 * matcher's own examples: they are string literals in assertions, never
 * executed against a connection. Both are asserted below to still contain the
 * shape, so neither exemption can quietly start covering nothing.
 */
const ALLOWED = [
  join(SRC, 'integration', 'stuck-connection-reaper.integration.test.ts'),
  join(SRC, 'db', 'no-held-portals.test.ts'),
];

/** The matcher. Client-side portal APIs, not SQL text. */
function holdsAPortal(src: string): boolean {
  return /\.cursor\s*\(/.test(src) || /\.(writable|readable)\s*\(\s*\)/.test(src);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      sourceFiles(p, out);
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (ALLOWED.includes(p)) continue;
    out.push(p);
  }
  return out;
}

describe('SELF-TEST: the matcher fires on what it claims to', () => {
  it('catches a cursor, however it is spelled', () => {
    expect(holdsAPortal('await sql`SELECT 1`.cursor(100, fn)')).toBe(true);
    expect(holdsAPortal('for await (const rows of sql`SELECT 1`.cursor(10)) {}')).toBe(true);
    expect(holdsAPortal('q .cursor (1, fn)')).toBe(true);
  });

  it('catches a COPY stream', () => {
    expect(holdsAPortal('const w = await sql`copy contacts from stdin`.writable()')).toBe(true);
    expect(holdsAPortal('const r = await sql`copy contacts to stdout`.readable()')).toBe(true);
  });

  it('does NOT fire on ordinary queries, or on SQL that merely says COPY', () => {
    expect(holdsAPortal('const rows = await sql`SELECT 1 AS ok`')).toBe(false);
    expect(holdsAPortal('await db.select().from(contacts)')).toBe(false);
    // The AI-analytics guard lists COPY among the statements it REJECTS. That
    // is proof the shape is forbidden, not a use of it — the matcher must not
    // read a string literal as a portal.
    expect(holdsAPortal("const violators = ['COPY contacts FROM stdin', 'VACUUM x'];")).toBe(false);
    expect(holdsAPortal('stream.readable')).toBe(false);
    expect(holdsAPortal('res.writable')).toBe(false);
    expect(holdsAPortal('')).toBe(false);
  });

  it('SELF-TEST: it is reading real files, and enough of them', () => {
    // A wrong path would make the assertion below vacuously true.
    const files = sourceFiles(SRC);
    expect(files.length, 'the source tree was not found').toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(join('db', 'client.ts')))).toBe(true);
    expect(readFileSync(files[0]!, 'utf8').length).toBeGreaterThan(10);
    // The allowlisted file exists and really does hold a portal — otherwise the
    // exemption is silently protecting nothing and would hide a later offender.
    for (const p of ALLOWED) {
      expect(holdsAPortal(readFileSync(p, 'utf8')), `${p} no longer holds a portal`).toBe(true);
    }
    expect(
      files.some((f) => ALLOWED.includes(f)),
      'ALLOWED must be excluded',
    ).toBe(false);
  });
});

describe('the watchdog cannot mistake a feature for a wedge', () => {
  it(
    'no file in apps/api/src holds a cursor or a COPY stream',
    () => {
      const offenders = sourceFiles(SRC)
        .filter((p) => holdsAPortal(readFileSync(p, 'utf8')))
        .map((p) => p.slice(SRC.length + 1).replace(/\\/g, '/'));

      expect(
        offenders,
        `these files hold a portal open on the API pool. db/stuck-connection-reaper.ts ` +
          `terminates any of our backends left in active/Client/ClientRead, which is ` +
          `exactly the state a held portal sits in — it would be killed mid-use. Use a ` +
          `separate pool with its own application_name instead.`,
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
