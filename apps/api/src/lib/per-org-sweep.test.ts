/**
 * A broken organisation is skipped, named, and counted.
 *
 * The three internal sweeps used to wrap their per-org call in
 * `catch { /* skip *\/ }`. The cron went green, the response said every
 * organisation had been processed, and an org whose credentials had expired
 * stopped producing data with nothing anywhere saying so.
 *
 * These assertions are about all three properties, because dropping any one of
 * them puts the failure back out of sight: the sweep must CONTINUE (or one
 * broken org costs everyone behind it), must LOG the org id (or you cannot
 * tell which one), and must COUNT (or the caller cannot report it).
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It does not run the three routes. It exercises the helper they all call;
 *    that they call it is what `routes/v1/internal/*.ts` shows and what
 *    typecheck enforces, not something asserted here.
 *  - It says nothing about whether a failure is recoverable. Whether a missed
 *    run leaves a permanent hole is a property of the work, not of the sweep —
 *    recorded per endpoint in the comments there.
 *  - It captures `console.error` through an injected logger, not the real one,
 *    so it proves what the helper writes rather than where it ends up.
 */
import { describe, it, expect } from 'vitest';
import { sweepOrgs } from './per-org-sweep.js';

/** Collects what the sweep would have written to console.error. */
function recorder() {
  const lines: string[] = [];
  return { lines, error: (msg: string) => lines.push(msg) };
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('sweepOrgs', () => {
  it('returns every result when nothing fails, and logs nothing', async () => {
    const log = recorder();
    const out = await sweepOrgs([A, B], 'probe', async (id) => id.slice(0, 2), log);

    expect(out.attempted).toBe(2);
    expect(out.succeeded).toEqual(['11', '22']);
    expect(out.failures).toEqual([]);
    // A quiet run must stay quiet, or the loud one stops standing out.
    expect(log.lines).toEqual([]);
  });

  it('keeps going after one organisation throws', async () => {
    const log = recorder();
    const seen: string[] = [];

    const out = await sweepOrgs(
      [A, B, C],
      'probe',
      async (id) => {
        seen.push(id);
        if (id === B) throw new Error('token expired');
        return 1;
      },
      log,
    );

    // The one that broke did not cost the one behind it.
    expect(seen).toEqual([A, B, C]);
    expect(out.succeeded).toEqual([1, 1]);
    expect(out.failures).toHaveLength(1);
  });

  it('names the organisation and the reason in the log', async () => {
    const log = recorder();
    await sweepOrgs(
      [A, B],
      'ads-sync',
      async (id) => {
        if (id === B) throw new Error('token expired');
        return 0;
      },
      log,
    );

    const perOrg = log.lines.find((l) => l.includes(B));
    expect(perOrg, 'no log line mentions the failing org').toBeDefined();
    expect(perOrg).toContain('[ads-sync]');
    expect(perOrg).toContain('token expired');
    // The org that worked must not appear — a log that names everyone names
    // no one.
    expect(log.lines.filter((l) => l.includes(A))).toEqual([]);
  });

  it('summarises how many worked and how many did not', async () => {
    const log = recorder();
    const out = await sweepOrgs(
      [A, B, C],
      'seo-rank-poll',
      async (id) => {
        if (id !== A) throw new Error('nope');
        return 0;
      },
      log,
    );

    expect(out.failures.map((f) => f.orgId)).toEqual([B, C]);
    const summary = log.lines.find((l) => l.includes('organisations processed'));
    expect(summary, 'no summary line').toBeDefined();
    expect(summary).toContain('1/3');
    expect(summary).toContain('2 failed');
    // Both ids in the summary, so one grep finds every org to look at.
    expect(summary).toContain(B);
    expect(summary).toContain(C);
  });

  it('records the reason for each failure, not just the count', async () => {
    const out = await sweepOrgs(
      [A, B],
      'probe',
      async (id) => {
        throw new Error(`boom ${id.slice(0, 2)}`);
      },
      recorder(),
    );
    expect(out.failures).toEqual([
      { orgId: A, error: 'boom 11' },
      { orgId: B, error: 'boom 22' },
    ]);
  });

  it('survives a thrown value that is not an Error', async () => {
    // `throw 'string'` reaches this from library code often enough that
    // `(err as Error).message` would put `undefined` in the log.
    const out = await sweepOrgs(
      [A],
      'probe',
      async () => {
        throw 'plain string';
      },
      recorder(),
    );
    expect(out.failures[0]?.error).toBe('plain string');
  });

  it('an empty organisation list is a quiet no-op', async () => {
    const log = recorder();
    const out = await sweepOrgs([], 'probe', async () => 1, log);
    expect(out).toEqual({ attempted: 0, succeeded: [], failures: [] });
    expect(log.lines).toEqual([]);
  });
});
