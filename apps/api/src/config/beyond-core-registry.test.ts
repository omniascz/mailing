/**
 * The group names in index.ts and the list in @forgemsg/shared/beyond-core are
 * the same set.
 *
 * ─── What this scan CANNOT see ───────────────────────────────────────────────
 *
 * It reads index.ts as text and matches `registerBeyondCore('name', plugin)`
 * with the name as a string literal on the same line. That is the only form the
 * file uses, and the test below proves the matcher against a fixture rather
 * than trusting the regex by eye — #118 is the reason: a scan there matched a
 * literal path, called a wired route dead, and nobody checked the matcher.
 *
 * Deliberately blind to:
 *
 *   - a name built at runtime (`registerBeyondCore(g, …)` from a variable or a
 *     template literal). No call site does that, and the point of the argument
 *     being a literal is that it stays greppable. If someone introduces one,
 *     this test reports it as a MISSING name in index.ts rather than silently
 *     passing — the failure is loud but the message will be confusing, which is
 *     the honest limit of a text scan.
 *   - whether the group actually WORKS. It checks names, not reachability.
 *     A group can be spelled right, registered, and still be one of the twelve
 *     the probe found broken.
 *   - anything outside index.ts. A second file calling registerBeyondCore would
 *     be invisible here; there is no second file, and the helper is a local
 *     closure so there cannot be one without a refactor.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEYOND_CORE_GROUPS, BEYOND_CORE_BLOCKED } from '@forgemsg/shared/beyond-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, '../index.ts');

/** The matcher under test. Exported shape kept trivial so the self-test can drive it. */
function namesIn(source: string): string[] {
  return [...source.matchAll(/registerBeyondCore\(\s*'([a-z0-9-]+)'\s*,/g)].map((m) => m[1]!);
}

describe('the matcher itself', () => {
  it('finds a normal call', () => {
    expect(namesIn(`await registerBeyondCore('survey', surveyRoutes);`)).toEqual(['survey']);
  });

  it('finds several, in order, across lines', () => {
    const src = [
      `await registerBeyondCore('survey', surveyRoutes);`,
      `await registerBeyondCore('crm-deal', crmDealRoutes);`,
    ].join('\n');
    expect(namesIn(src)).toEqual(['survey', 'crm-deal']);
  });

  it('does not match the helper definition, which takes a typed parameter', () => {
    expect(
      namesIn(`const registerBeyondCore = async (group: BeyondCoreGroup, plugin) => {`),
    ).toEqual([]);
  });

  it('does not match a name built at runtime — the documented blind spot', () => {
    // If this ever appears in index.ts the name is invisible here, and the test
    // fails as "declared but never registered" rather than passing quietly.
    expect(namesIn(`await registerBeyondCore(someName, plugin);`)).toEqual([]);
    expect(namesIn('await registerBeyondCore(`crm-${x}`, plugin);')).toEqual([]);
  });

  it('does not match a mention inside prose', () => {
    expect(namesIn(` * registerBeyondCore is called with a name and a plugin.`)).toEqual([]);
  });
});

describe('index.ts and BEYOND_CORE_GROUPS agree', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  const used = namesIn(source);

  it('every registered name is a declared group', () => {
    const declared = new Set<string>(BEYOND_CORE_GROUPS);
    const unknown = used.filter((n) => !declared.has(n));
    expect(unknown, 'registered in index.ts but missing from BEYOND_CORE_GROUPS').toEqual([]);
  });

  it('every declared group is registered somewhere', () => {
    const usedSet = new Set(used);
    const unused = BEYOND_CORE_GROUPS.filter((g) => !usedSet.has(g));
    expect(unused, 'declared in BEYOND_CORE_GROUPS but never registered').toEqual([]);
  });

  it('no name is registered twice', () => {
    const seen = new Set<string>();
    const dupes = used.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes).toEqual([]);
  });

  it('the count is the 76 the probe measured', () => {
    expect(used).toHaveLength(76);
    expect(BEYOND_CORE_GROUPS).toHaveLength(76);
  });
});

describe('the blocklist is data, and carries its reason', () => {
  it('names only real groups', () => {
    const declared = new Set<string>(BEYOND_CORE_GROUPS);
    for (const b of BEYOND_CORE_BLOCKED) {
      expect(declared.has(b.group), `${b.group} is blocked but is not a group`).toBe(true);
    }
  });

  it('every entry states why, at length enough to be a reason', () => {
    for (const b of BEYOND_CORE_BLOCKED) {
      // A one-word "broken" is not a reason anyone can act on. The bar is low
      // and deliberate: it only has to stop an empty string sneaking in.
      expect(b.reason.length, `${b.group} has no usable reason`).toBeGreaterThan(60);
    }
  });

  it('blocks stock-alert, and says what it destroys', () => {
    const entry = BEYOND_CORE_BLOCKED.find((b) => b.group === 'stock-alert');
    expect(
      entry,
      'stock-alert must stay blocked — it consumes subscriptions and sends nothing',
    ).toBeDefined();
    expect(entry!.reason).toMatch(/notifiedAt/);
  });
});
