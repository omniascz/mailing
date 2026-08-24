import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The send path's dynamic imports, and the warm-up that has to cover them.
 *
 * ─── The bug this exists to catch coming back ────────────────────────────────
 *
 * `sendTransactionalEmail` loads part of its graph with a dynamic import
 * inside the function body. A dynamic import there is invisible to static
 * loading, so a `beforeAll` that imports `queues.js` does not warm it — the
 * first test to call the function pays for it inside its own 10s budget.
 *
 * Measured under 12-way CPU contention, that one import took 14505ms. The
 * first test timed out mid-send; vitest moved on; the abandoned send resolved
 * two seconds later and called the shared `queueAdd` spy, so the SECOND test
 * failed with "expected spy to be called 1 times, but got 2 times". Both
 * reported symptoms, one cause.
 *
 * ─── Why this is a source check rather than a timing one ─────────────────────
 *
 * A test that asserts "the send is fast" measures the machine, and would have
 * passed on every idle run — this failure needed contention to appear at all,
 * which is exactly why it survived three PRs. What does NOT depend on the
 * machine is the list of modules the send path loads late. If someone adds
 * another dynamic import to that path, this fails immediately and names it,
 * on any machine, at any load.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const QUEUES = readFileSync(join(here, 'queues.ts'), 'utf8');
const VERP_TEST = readFileSync(join(here, 'transactional-verp.test.ts'), 'utf8');

/**
 * The body of the warm-up hook, and nothing else.
 *
 * Scoped deliberately: the first version of this test searched the whole file,
 * and passed against a warm-up that had been reverted — because the docstring
 * above the hook quotes the very specifier it was looking for. A guard that a
 * comment can satisfy is not a guard.
 */
function warmupBody(source: string): string {
  const start = source.indexOf('beforeAll(');
  if (start === -1) return '';
  const end = source.indexOf('}, 60_000);', start);
  return end === -1 ? '' : source.slice(start, end);
}

/** Every `await import('…')` written inside queues.ts. */
function dynamicImportsIn(source: string): string[] {
  const found = new Set<string>();
  const re = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(re)) found.add(m[1]!);
  return [...found].sort();
}

describe('the transactional send path', () => {
  it('still loads part of its graph lazily — otherwise this file is obsolete', () => {
    // If the dynamic import is ever replaced by a static one the warm-up stops
    // mattering, and this test should be deleted rather than left passing
    // vacuously.
    expect(dynamicImportsIn(QUEUES).length, 'no dynamic imports left in queues.ts').toBeGreaterThan(
      0,
    );
  });

  it('warms every module it imports lazily', () => {
    const warmup = warmupBody(VERP_TEST);
    expect(warmup, 'no beforeAll warm-up found at all').not.toBe('');

    const lazy = dynamicImportsIn(QUEUES);
    // The test file sits beside queues.ts, so it warms by the same specifier.
    const missing = lazy.filter((spec) => !warmup.includes(`import('${spec}')`));

    expect(
      missing,
      'these modules are loaded late by the send path and are not in the beforeAll warm-up. ' +
        'The first test to call sendTransactionalEmail will pay for them inside its own budget, ' +
        'and under load that is a timeout whose abandoned call lands on the next test.',
    ).toEqual([]);
  });

  it('the warm-up has room to do it, and the tests do not', () => {
    // Loading a graph under contention is setup and needs a budget; a TEST
    // that needs more than the suite default is telling you something, so the
    // allowance stays on the hook alone.
    expect(VERP_TEST).toMatch(/beforeAll\([\s\S]*?\}\s*,\s*60_000\)/);
    expect(VERP_TEST, 'a per-test timeout would hide this rather than fix it').not.toMatch(
      /it\([^)]*\}\s*,\s*\d{5,}\)/,
    );
  });
});
