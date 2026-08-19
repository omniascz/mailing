/**
 * LAYER 2 — the runtime guard itself.
 *
 * The rest of the integration suite exercises the guard implicitly: it is armed
 * for every file, so any query any test provokes is planned before it runs.
 * This file asserts the guard's own contract, which that implicit use cannot:
 *
 *   - it is actually ON here (a guard that silently failed to install would
 *     make every other file's coverage imaginary)
 *   - it rejects a statement naming a column that does not exist
 *   - it says which query, so the failure is actionable
 *   - it lets type and syntax errors through untouched, so the real error is
 *     what the developer sees
 *   - it refuses to arm in production regardless of the flag
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  explainGuardEnabled,
  getExplainViolations,
  clearExplainViolations,
} from '../db/explain-guard.js';
import { computeOrgHealth } from '../services/deliverability/health-score.js';

/**
 * drizzle wraps whatever the driver throws in a `Failed query: …` error and
 * hangs the original off `cause`, so the text we care about is never the top
 * message. Flatten the chain before matching.
 */
function causeChain(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let depth = 0; e instanceof Error && depth < 10; depth++) {
    parts.push(e.message);
    e = (e as { cause?: unknown }).cause;
  }
  return parts.join('\n--- caused by ---\n');
}

async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return causeChain(err);
  }
  throw new Error('expected the query to reject, but it resolved');
}

describe('layer 2 — runtime EXPLAIN guard', () => {
  beforeAll(() => clearExplainViolations());
  afterAll(() => clearExplainViolations());

  it('is armed for the integration suite', () => {
    expect(explainGuardEnabled()).toBe(true);
  });

  it('refuses to arm under NODE_ENV=production even with the flag set', () => {
    // The cost of this being on in production is a doubled query count on every
    // request, so one misread environment variable must not be able to do it.
    expect(explainGuardEnabled({ NODE_ENV: 'production', SQL_EXPLAIN_GUARD: '1' })).toBe(false);
    expect(explainGuardEnabled({ NODE_ENV: 'test', SQL_EXPLAIN_GUARD: '1' })).toBe(true);
    expect(explainGuardEnabled({ NODE_ENV: 'test' })).toBe(false);
  });

  it('rejects a query naming a column the schema does not have', async () => {
    clearExplainViolations();
    // sql-explain-ignore: fixture, must name a column the schema does not have
    const message = await rejection(
      db.execute(sql`SELECT no_such_column FROM email_events LIMIT 1`),
    );
    expect(message).toMatch(/sql-explain-guard/);

    const v = getExplainViolations();
    expect(v).toHaveLength(1);
    expect(v[0]!.code).toBe('42703');
    expect(v[0]!.message).toMatch(/no_such_column/);
    // The offending statement has to be in the report, or the failure is a
    // riddle rather than a bug report.
    expect(v[0]!.query).toMatch(/no_such_column/);
  });

  it('rejects a query naming a table the schema does not have', async () => {
    clearExplainViolations();
    // sql-explain-ignore: fixture, must name a table the schema does not have
    const message = await rejection(db.execute(sql`SELECT 1 FROM no_such_table`));
    expect(message).toMatch(/sql-explain-guard/);
    expect(getExplainViolations()[0]!.code).toBe('42P01');
  });

  it('lets a valid query through untouched', async () => {
    clearExplainViolations();
    const rows = await db.execute<{ n: number }>(sql`SELECT 1::int AS n`);
    expect((rows as unknown as Array<{ n: number }>)[0]!.n).toBe(1);
    expect(getExplainViolations()).toHaveLength(0);
  });

  it('does not swallow a non-schema error — the real one still surfaces', async () => {
    clearExplainViolations();
    // A type error, not a schema error. The guard must stand aside so the
    // developer sees Postgres's own message rather than ours.
    // sql-explain-ignore: fixture, a deliberate type error the guard must not claim
    const message = await rejection(db.execute(sql`SELECT 'abc'::uuid`));
    expect(message).toMatch(/invalid input syntax/i);
    expect(message).not.toMatch(/sql-explain-guard/);
    expect(getExplainViolations()).toHaveLength(0);
  });

  /**
   * The reason this layer exists.
   *
   * `computeOrgHealth` used to append `sending_domain = …` only when a caller
   * passed a domain. Layer 1 reads the source and sees the statement WITHOUT
   * that fragment — which plans perfectly — so the broken column was invisible
   * to it. Only walking the branch reveals it.
   *
   * The column reference is gone now, so what this asserts today is that the
   * branch is reachable from a test and that taking it produces no violation.
   * Point 9's proof re-introduces the old line and shows the guard catching it.
   */
  it('sees conditional fragments, which layer 1 cannot', async () => {
    clearExplainViolations();
    const orgId = '00000000-0000-0000-0000-000000000000';

    await computeOrgHealth({ orgId, days: 7 });
    expect(getExplainViolations()).toHaveLength(0);

    // The scoped variant is rejected before it reaches SQL at all now.
    await expect(computeOrgHealth({ orgId, domain: 'example.com' })).rejects.toThrow(
      /sending domain/i,
    );
    expect(getExplainViolations()).toHaveLength(0);
  });
});
