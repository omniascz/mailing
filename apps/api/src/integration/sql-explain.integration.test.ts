/**
 * LAYER 1 — every raw sql`` statement in the repo, handed to the planner.
 *
 * Twelve queries shipped naming columns the database does not have. typecheck
 * exits 0 on all of them, drizzle-kit never reads inside a sql`` template, and
 * none of the ten affected functions had a test. Nothing static was going to
 * catch that class, because the authority on whether `re.line_items` resolves
 * is Postgres, not TypeScript.
 *
 * So: collect the templates, substitute their holes, and run EXPLAIN. The
 * planner resolves identifiers at parse-analysis time, which means a missing
 * column is reported whether or not the table holds a single row — no fixtures
 * needed. EXPLAIN without ANALYZE does not execute the statement, so an INSERT
 * or DELETE in the list is inspected, never run. Each one is wrapped in
 * BEGIN/ROLLBACK anyway.
 *
 * ─── Two buckets, and why the second one has a ceiling ──────────────────────
 *
 * FINDINGS are 42703 (undefined_column) and 42P01 (undefined_table). These fail
 * the test.
 *
 * UNANALYSABLE are statements no substitution could get past the parser, plus
 * statements whose table or column name is chosen at runtime. These do NOT fail
 * the test — reporting them as findings is how a check like this turns into
 * noise nobody reads.
 *
 * But an exclusion bucket with no ceiling is a slow leak: a genuinely broken
 * query that happens to also be unparseable would sit in it forever, silently.
 * So the bucket is capped. If it grows, this test fails and asks for the new
 * entry to be looked at and the cap moved deliberately.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { collectTemplates, type Template } from './sql-explain/collect.js';
import {
  materialise,
  materialiseRandom,
  isCompleteStatement,
  isCorrelatedFragment,
  PROFILE_COUNT,
  RANDOM_ATTEMPTS,
} from './sql-explain/materialise.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const ROOTS = ['apps/api/src', 'apps/workers/src'];

/**
 * Ceiling on statements this layer cannot analyse. Today's 19 break down as
 * 11 dynamic-identifier, 2 correlated-subquery, and 6 that no substitution
 * could get past the parser.
 *
 * Raise it only after reading the entry the failure names and satisfying
 * yourself it is genuinely un-plannable rather than genuinely broken. Lowering
 * it never needs permission — the assertion is `<=`.
 */
const MAX_UNANALYSABLE = 19;

interface Finding {
  file: string;
  line: number;
  code: string;
  message: string;
  sql: string;
}
interface Unanalysable {
  file: string;
  line: number;
  reason: string;
  detail: string;
}

let sql: postgres.Sql;
let templates: Template[] = [];
const findings: Finding[] = [];
const unanalysable: Unanalysable[] = [];
let completeCount = 0;
let fragmentCount = 0;
let plannedOk = 0;

beforeAll(async () => {
  sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
  templates = collectTemplates(ROOTS, REPO_ROOT);

  for (const tpl of templates) {
    // A fragment is not a statement; it has no FROM of its own and only makes
    // sense spliced into a parent. Layer 2 sees these once composed.
    if (!isCompleteStatement(materialise(tpl, 0).sql)) {
      fragmentCount++;
      continue;
    }
    completeCount++;

    let lastError: { code?: string; message: string } | null = null;
    let settled = false;

    const TOTAL_ATTEMPTS = PROFILE_COUNT + RANDOM_ATTEMPTS;
    for (let attempt = 0; attempt < TOTAL_ATTEMPTS && !settled; attempt++) {
      const {
        sql: text,
        hasDynamicIdentifier,
        dynamicHoles,
      } = attempt < PROFILE_COUNT
        ? materialise(tpl, attempt)
        : materialiseRandom(tpl, attempt - PROFILE_COUNT + 1);
      if (hasDynamicIdentifier) {
        unanalysable.push({
          file: tpl.file,
          line: tpl.line,
          reason: 'dynamic-identifier',
          detail: `runtime-chosen table/column name (${dynamicHoles.join(', ').slice(0, 120)})`,
        });
        settled = true;
        break;
      }

      try {
        await sql.unsafe('BEGIN');
        await sql.unsafe(`EXPLAIN ${text}`);
        await sql.unsafe('ROLLBACK');
        plannedOk++;
        settled = true;
      } catch (err) {
        try {
          await sql.unsafe('ROLLBACK');
        } catch {
          /* the transaction is already gone; nothing to undo */
        }
        const e = err as { code?: string; message?: string };
        const code = e.code ?? '';
        const message = (e.message ?? String(err)).split('\n')[0]!;

        if (isCorrelatedFragment(code, message)) {
          // Looks like a statement, is really a correlated subquery: the name
          // it cannot resolve belongs to the query it gets spliced into.
          unanalysable.push({
            file: tpl.file,
            line: tpl.line,
            reason: 'correlated-subquery',
            detail: message,
          });
          settled = true;
        } else if (code === '42703' || code === '42P01') {
          // A placeholder can break parsing. It cannot invent a column name —
          // so this verdict is trustworthy on the profile that produces it.
          findings.push({ file: tpl.file, line: tpl.line, code, message, sql: text });
          settled = true;
        } else {
          lastError = { code, message };
        }
      }
    }

    if (!settled) {
      unanalysable.push({
        file: tpl.file,
        line: tpl.line,
        reason: `unparseable-after-${PROFILE_COUNT + RANDOM_ATTEMPTS}-attempts`,
        detail: `${lastError?.code ?? '?'} ${lastError?.message ?? 'unknown'}`,
      });
    }
  }
}, 300_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

describe('layer 1 — static EXPLAIN over every raw sql`` statement', () => {
  it('collected the templates it should have', () => {
    // A check that scans nothing passes just as quietly as one that scans
    // everything, so the floor is set close to the real count rather than at
    // zero. An earlier pre-filter here dropped 77 templates by not allowing for
    // drizzle's `sql<number>`…`` form, and nothing would have said so.
    expect(templates.length).toBeGreaterThan(850);
    expect(completeCount).toBeGreaterThan(150);
    expect(plannedOk).toBeGreaterThan(140);
  });

  it('no statement references a column or table that does not exist', () => {
    const report = findings
      .map(
        (f) =>
          `\n  ${f.file}:${f.line}\n    [${f.code}] ${f.message}\n    ${f.sql.replace(/\s+/g, ' ').slice(0, 220)}`,
      )
      .join('\n');
    expect(findings, `Statements the planner rejected:\n${report}\n`).toEqual([]);
  });

  it('the unanalysable bucket has not grown', () => {
    const report = unanalysable
      .map((u) => `\n  ${u.file}:${u.line}  [${u.reason}] ${u.detail}`)
      .join('');
    expect(
      unanalysable.length,
      `${unanalysable.length} statements could not be planned (ceiling ${MAX_UNANALYSABLE}).` +
        ` These are excluded from the check above, so a real bug can hide here —` +
        ` look at any new entry before raising MAX_UNANALYSABLE:${report}\n`,
    ).toBeLessThanOrEqual(MAX_UNANALYSABLE);
  });

  it('reports its coverage', () => {
    const analysed = completeCount - unanalysable.length;

    console.log(
      `\n[layer 1] ${templates.length} sql\`\` templates` +
        `\n          ${fragmentCount} fragments (not standalone statements — layer 2 covers these)` +
        `\n          ${completeCount} complete statements` +
        `\n          ${plannedOk} planned OK` +
        `\n          ${unanalysable.length} unanalysable (ceiling ${MAX_UNANALYSABLE})` +
        `\n          ${findings.length} findings` +
        `\n          coverage of complete statements: ${((analysed / completeCount) * 100).toFixed(1)}%\n`,
    );
    expect(analysed).toBeGreaterThan(0);
  });
});
