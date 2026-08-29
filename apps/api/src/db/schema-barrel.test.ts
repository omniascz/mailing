/**
 * Every pgTable in db/schema/** must be re-exported from db/schema/index.ts.
 *
 * `drizzle.config.ts` names that one file as the schema entry, so a table not
 * re-exported from it is invisible to drizzle-kit: no migration is generated,
 * ever, silently. Meanwhile services import the module directly and query the
 * table at runtime.
 *
 * That is not hypothetical. `data-sets.ts` and `permission-sets.ts` were both
 * missing from the barrel, so `data_sets`, `permission_sets` and
 * `user_permission_sets` had no migration while GET /api/v1/data-sets was live
 * and answering 500 with `relation "data_sets" does not exist`.
 *
 * This is a unit test on purpose: it reads files, needs no database, and so
 * runs in the fast suite on every push rather than only where Postgres exists.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCAN_TIMEOUT_MS } from '../test-support/scan-budget.js';

const SCHEMA_DIR = path.dirname(fileURLToPath(import.meta.url)) + path.sep + 'schema';
const BARREL = path.join(SCHEMA_DIR, 'index.ts');

/** `pgTable('name', …)` — the call is usually spread over several lines. */
const PG_TABLE = /pgTable\(\s*['"]([a-z_0-9]+)['"]/gs;

interface Declared {
  table: string;
  module: string;
}

function declaredTables(): Declared[] {
  const out: Declared[] = [];
  for (const entry of fs.readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    if (entry.name === 'index.ts' || entry.name.endsWith('.test.ts')) continue;
    const source = fs.readFileSync(path.join(SCHEMA_DIR, entry.name), 'utf8');
    for (const m of source.matchAll(PG_TABLE)) {
      out.push({ table: m[1]!, module: entry.name.replace(/\.ts$/, '') });
    }
  }
  return out;
}

function barrelExports(): Set<string> {
  const source = fs.readFileSync(BARREL, 'utf8');
  const names = new Set<string>();
  for (const m of source.matchAll(/export \* from '\.\/([\w.-]+)\.js'/g)) names.add(m[1]!);
  return names;
}

describe('db/schema/index.ts barrel', () => {
  it(
    'finds the schema modules at all',
    () => {
      // A check that scans nothing passes quietly; pin a floor so a moved
      // directory fails loudly instead.
      expect(declaredTables().length).toBeGreaterThan(250);
      expect(barrelExports().size).toBeGreaterThan(100);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    're-exports every module that declares a pgTable',
    () => {
      const exported = barrelExports();
      const missing = declaredTables().filter((d) => !exported.has(d.module));

      const report = missing
        .map(
          (d) =>
            `\n  ${d.table.padEnd(28)} declared in schema/${d.module}.ts but not re-exported` +
            `\n  ${''.padEnd(28)} → add: export * from './${d.module}.js';`,
        )
        .join('');

      expect(
        missing,
        `${missing.length} table(s) are invisible to drizzle-kit because their module is not in` +
          ` the barrel. No migration will ever be generated for them, while the services that` +
          ` import them directly will query them at runtime and get` +
          ` \`relation "…" does not exist\`.${report}\n`,
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
