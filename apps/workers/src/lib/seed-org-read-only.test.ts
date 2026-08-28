import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * No integration file may write to the shared seed organisation.
 *
 * ─── The failure this exists to stop coming back ─────────────────────────────
 *
 * Three files needed the demo org to carry a company name and a postal address
 * (the compliance footer is built from them), and each filled the columns in
 * with `UPDATE organizations … COALESCE(...)`. COALESCE means the FIRST file
 * to run decides the value and nothing puts it back, so a file that later
 * asserted on the address was asserting on somebody else's write. It surfaced
 * in #75 as `expected … to contain 'Nádražní 1'` and looked like flakiness.
 *
 * It was not flakiness and it was not parallelism — both integration configs
 * set `fileParallelism: false`. It was ORDER: vitest's BaseSequencer runs
 * files with no cached result largest-first, and cached ones failed-first then
 * slowest-first. Adding one file silently re-orders the rest.
 *
 * Those columns are seed data now (apps/api/scripts/seed.ts) and tests read
 * them through setup/seed-org.ts. A test that needs a DIFFERENT organisation
 * creates its own — which ~20 files in apps/api/src/integration already do
 * with `db.insert(organizations)`.
 *
 * ─── WHAT THIS SCAN CANNOT SEE ───────────────────────────────────────────────
 *
 *   - A write that reaches the row some other way: through the API (a PATCH to
 *     /api/v1/settings, say), through a service function, or through raw SQL
 *     built by string concatenation rather than written out. This matches
 *     source text, not behaviour.
 *   - A write to a DIFFERENT shared row — seeded contacts, lists, tags, the
 *     draft campaign. Only `organizations` is checked, because that is the row
 *     with the demonstrated failure. A guard for the rest would be a guess.
 *   - Whether a flagged write actually targets the seed org. `WHERE id =
 *     <an org this file created>` is flagged just the same. That is deliberate:
 *     a file that made its own org has no reason to UPDATE it either — it can
 *     insert the values it wants — and a matcher that tried to tell the two
 *     apart by reading the WHERE clause would be the kind of cleverness that
 *     goes quietly wrong.
 *   - Mentions in prose. The word appearing in a comment is flagged like a
 *     statement; the self-tests below pin exactly that, so nobody has to guess
 *     whether it was intended.
 *   - Files outside the two integration directories, and any file whose name
 *     does not end in `.integration.test.ts`.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIRS = [
  join(HERE, '..', 'integration'),
  join(HERE, '..', '..', '..', 'api', 'src', 'integration'),
];

/**
 * The matcher. Kept beside its self-tests, and deliberately dumb: two literal
 * forms, no attempt to parse SQL or TypeScript.
 */
function writesToOrganizations(src: string): boolean {
  return /update\s+organizations\b/i.test(src) || /\.update\(\s*organizations\s*[,)]/.test(src);
}

function integrationFiles(): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = [];
  for (const dir of DIRS) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.integration.test.ts')) out.push({ path: join(dir, name), name });
    }
  }
  return out;
}

describe('SELF-TEST: the matcher fires on what it claims to', () => {
  it('catches raw SQL, in either case and across a line break', () => {
    expect(writesToOrganizations('await sql`UPDATE organizations SET x = 1`')).toBe(true);
    expect(writesToOrganizations('await sql`update organizations set x = 1`')).toBe(true);
    expect(writesToOrganizations('await sql`\n      UPDATE organizations\n      SET x = 1`')).toBe(
      true,
    );
  });

  it('catches the drizzle form, spaced or not', () => {
    expect(writesToOrganizations('db.update(organizations).set({ x: 1 })')).toBe(true);
    expect(writesToOrganizations('db\n  .update( organizations )\n  .set({})')).toBe(true);
    expect(writesToOrganizations('.update(organizations, extra)')).toBe(true);
  });

  it('catches a mention in a comment, and says so rather than pretending not to', () => {
    // Listed in the header as a known false positive. Pinned here so the
    // behaviour is a decision rather than an accident.
    expect(writesToOrganizations('// never UPDATE organizations from a test')).toBe(true);
  });

  it('does NOT fire on the things a test is allowed to do', () => {
    expect(writesToOrganizations('db.insert(organizations).values({})')).toBe(false);
    expect(
      writesToOrganizations('db.delete(organizations).where(eq(organizations.id, orgId))'),
    ).toBe(false);
    expect(writesToOrganizations('SELECT id FROM organizations WHERE slug = $1')).toBe(false);
    expect(writesToOrganizations('await db.update(campaigns).set({ status })')).toBe(false);
    expect(writesToOrganizations('.update(organizationsSettings)')).toBe(false);
    expect(writesToOrganizations('')).toBe(false);
  });

  it('SELF-TEST: it is reading real files, and enough of them', () => {
    // A readdir on a wrong path throws, but a path that resolved to an empty
    // or renamed directory would leave the assertion below vacuously true.
    const files = integrationFiles();
    expect(files.length, 'no integration files found — the paths are wrong').toBeGreaterThan(40);
    expect(files.map((f) => f.name)).toContain('campaign-content-shape.integration.test.ts');
    expect(files.map((f) => f.name)).toContain('route-smoke.integration.test.ts');
    const one = readFileSync(files[0]!.path, 'utf8');
    expect(one.length, 'the files read back empty').toBeGreaterThan(100);
  });
});

describe('the seed organisation is read-only for integration tests', () => {
  it('no integration file writes to organizations', () => {
    const offenders = integrationFiles()
      .filter(({ path }) => writesToOrganizations(readFileSync(path, 'utf8')))
      .map(({ name }) => name);

    expect(
      offenders,
      `these files write to organizations. The seed org's company_name and ` +
        `postal_address are seed data — read them with setup/seed-org.ts. If you need ` +
        `different values, insert your own organisation instead of editing the shared one.`,
    ).toEqual([]);
  });
});
