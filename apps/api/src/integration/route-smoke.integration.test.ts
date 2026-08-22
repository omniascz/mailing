/**
 * Every GET route in the OpenAPI document, called for real, asserting only that
 * it does not answer 5xx.
 *
 * This is the cheapest net in the series and it catches a different class than
 * the EXPLAIN layers do. Those two reason about SQL; this one runs the handler.
 * `/api/v1/analytics/compare` returns 500 because it dereferences `req.user`
 * with no auth guard — nothing about SQL is wrong with it, and no amount of
 * planning would have found it.
 *
 * ─── What counts as failure ─────────────────────────────────────────────────
 *
 * ONLY 5xx. The test does not know what any given route wants, so:
 *
 *   400/422  the route rejected input it required and we did not supply.
 *            That is the validation layer working, not a bug.
 *   401/403  the guard working. Some routes want a system-admin or a scope this
 *            session does not have.
 *   404      a real id was not available and the handler said so, having run.
 *   429      rate limited. Should not happen — see the remoteAddress note below.
 *   2xx/3xx  fine.
 *
 * A 5xx is different in kind: the handler was reached and threw. There is no
 * input a caller could supply that makes an unhandled exception acceptable.
 *
 * ─── Why this does not trip the rate limiter ────────────────────────────────
 *
 * The limiter is 100 req/min keyed on `x-api-key ?? request.ip`, hardcoded with
 * no override. A naive sweep gets ~100 answers and several hundred 429s, which
 * is what the original probe hit. Rather than change production config for a
 * test, each request is injected from its own `remoteAddress`, so each lands in
 * its own bucket. Measured: 140 calls from one address give 100×200 + 40×429;
 * 140 from distinct addresses give 140×200.
 */
import { env } from '../config/env.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { createTestApp, login, type Session } from './setup/harness.js';
import { resolveParams, DUMMY_UUID } from './route-smoke/resolve-params.js';
import { KNOWN_5XX, MAX_KNOWN_5XX } from './route-smoke/known-failures.js';

/**
 * Parameterised routes are swept twice, because the two paths through them fail
 * differently and each hides the other:
 *
 *   resolved  a real row id where one exists — reaches the happy path
 *   not-found a valid uuid that matches nothing — reaches the not-found path
 *
 * `/api/v1/blog/posts/{id}/revisions` is the case in point. With a real post it
 * answers 200; with an unknown one it answers 500, because the handler throws a
 * plain object literal instead of an Error and Fastify does not recognise it as
 * a 404. Sweeping only real ids would have missed that entirely.
 */
type Variant = 'resolved' | 'not-found';

interface Result {
  path: string;
  variant: Variant;
  url: string;
  status: number;
  body: string;
  /**
   * The thrown error, captured server-side. The response body only ever says
   * INTERNAL_ERROR — correct for a client, useless in a failure report.
   */
  error?: string;
}

/** url -> first error thrown while serving it. */
const errorsByUrl = new Map<string, string>();

let app: FastifyInstance;
let session: Session;
let sql: postgres.Sql;

const results: Result[] = [];
let paramStats = { realIds: 0, dummies: 0 };
let totalGet = 0;
let totalRequests = 0;
let parameterised = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Distinct source address per request — one rate-limit bucket each. */
let addressCounter = 0;
function nextAddress(): string {
  const n = addressCounter++;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${(n & 255) + 1}`;
}

/** A route that never answers is as broken as one that 500s. */
async function injectWithTimeout(
  url: string,
  ms = 20_000,
): Promise<{ status: number; body: string }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      app
        .inject({
          method: 'GET',
          url,
          headers: { cookie: session.cookie },
          remoteAddress: nextAddress(),
        })
        .then((r) => ({ status: r.statusCode, body: r.body.slice(0, 300) })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } catch (err) {
    return { status: 599, body: `[no response] ${(err as Error).message}` };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

beforeAll(async () => {
  app = await createTestApp();

  // Grab the real error on its way past the handler — the response body only
  // ever says INTERNAL_ERROR, which names no cause. Must be registered before
  // ready(): Fastify refuses addHook once the instance is listening.
  app.addHook('onError', async (request, _reply, err) => {
    const chain: string[] = [];
    let e: unknown = err;
    for (let i = 0; e instanceof Error && i < 5; i++) {
      chain.push(e.message.split('\n')[0]!);
      e = (e as { cause?: unknown }).cause;
    }
    if (!errorsByUrl.has(request.url)) errorsByUrl.set(request.url, chain.join(' <- '));
  });

  await app.ready();
  session = await login(app);
  sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });

  const specRes = await app.inject({ method: 'GET', url: '/docs/json' });
  const spec = specRes.json() as { paths: Record<string, Record<string, unknown>> };
  const paths = Object.entries(spec.paths)
    .filter(([, ops]) => 'get' in ops)
    .map(([p]) => p)
    .sort();
  totalGet = paths.length;

  // Collect every distinct parameter slot. The key carries the preceding path
  // segment because `{id}` means a different table on nearly every route.
  const keys = new Map<string, { key: string; param: string; precedingSegment: string | null }>();
  for (const p of paths) {
    const segments = p.split('/').filter(Boolean);
    segments.forEach((seg, i) => {
      const m = /^\{(.+)\}$/.exec(seg);
      if (!m) return;
      const param = m[1]!;
      const prev = segments[i - 1];
      const precedingSegment = prev && !prev.startsWith('{') ? prev : null;
      const key = `${param}@${precedingSegment ?? ''}`;
      if (!keys.has(key)) keys.set(key, { key, param, precedingSegment });
    });
    if (p.includes('{')) parameterised++;
  }

  const resolution = await resolveParams(sql, session.orgId, [...keys.values()]);
  paramStats = { realIds: resolution.realIds, dummies: resolution.dummies };

  const urlFor = (p: string, variant: Variant): string => {
    const segments = p.split('/').filter(Boolean);
    return (
      '/' +
      segments
        .map((seg, i) => {
          const m = /^\{(.+)\}$/.exec(seg);
          if (!m) return seg;
          const prev = segments[i - 1];
          const precedingSegment = prev && !prev.startsWith('{') ? prev : null;
          const resolved = resolution.values.get(`${m[1]!}@${precedingSegment ?? ''}`) ?? '';
          // Only swap uuid-shaped slots for the not-found pass. A slug or a
          // token has no "valid but absent" form worth a second request.
          if (variant === 'not-found' && UUID_RE.test(resolved)) return DUMMY_UUID;
          return resolved;
        })
        .join('/')
    );
  };

  // Only worth a second pass when at least one slot actually changes.
  const jobs: Array<{ path: string; variant: Variant; url: string }> = [];
  for (const p of paths) {
    const resolvedUrl = urlFor(p, 'resolved');
    jobs.push({ path: p, variant: 'resolved', url: resolvedUrl });
    const notFoundUrl = urlFor(p, 'not-found');
    if (notFoundUrl !== resolvedUrl) {
      jobs.push({ path: p, variant: 'not-found', url: notFoundUrl });
    }
  }
  totalRequests = jobs.length;

  // Modest concurrency: in-process injection, so this is mostly waiting on the
  // database. Sequential would take several minutes.
  const queue = [...jobs];
  const worker = async (): Promise<void> => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const { status, body } = await injectWithTimeout(job.url);
      const entry: Result = { path: job.path, variant: job.variant, url: job.url, status, body };
      const err = errorsByUrl.get(job.url);
      if (err !== undefined) entry.error = err;
      results.push(entry);
    }
  };
  await Promise.all(Array.from({ length: 8 }, () => worker()));
}, 600_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await app?.close();
});

describe('GET route smoke', () => {
  it('swept every GET route in the document', () => {
    // A sweep that finds nothing passes exactly as quietly as one that finds
    // everything, so pin the shape of the run itself.
    // Floor depends on how much of the product is registered: with
    // FEATURE_BEYOND_CORE off the document is ~340 paths smaller by design.
    expect(totalGet).toBeGreaterThan(env.FEATURE_BEYOND_CORE ? 600 : 400);
    expect(results.length).toBe(totalRequests);
    expect(totalRequests).toBeGreaterThan(totalGet);
    expect(results.filter((r) => r.status === 429)).toEqual([]);
  });

  it('reports its coverage', () => {
    const tally: Record<number, number> = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    const ordered = Object.entries(tally).sort((a, b) => Number(a[0]) - Number(b[0]));
    console.log(
      `\n[route-smoke] ${totalGet} GET routes` +
        `\n              ${totalGet - parameterised} without a path parameter, ${parameterised} with` +
        `\n              ${totalRequests} requests (${results.filter((r) => r.variant === 'not-found').length} of them a second, not-found pass)` +
        `\n              param slots filled: ${paramStats.realIds} from real rows, ${paramStats.dummies} placeholders` +
        `\n              status tally: ${ordered.map(([s, n]) => `${s}×${n}`).join('  ')}\n`,
    );
    expect(results.length).toBeGreaterThan(0);
  });

  it('no GET route answers 5xx, except the ones listed as known', () => {
    const failing = results.filter((r) => r.status >= 500);
    const unexpected = failing.filter((r) => !(r.path in KNOWN_5XX));

    const report = unexpected
      .map(
        (r) =>
          `\n  ${r.status}  ${r.path}` +
          `\n        called: ${r.url}` +
          `\n        error:  ${(r.error ?? r.body).replace(/\s+/g, ' ').slice(0, 220)}`,
      )
      .join('');

    expect(
      unexpected.map((r) => `${r.status} ${r.path}`),
      `${unexpected.length} GET route(s) answered 5xx and are not in the known list.` +
        ` A 5xx means the handler was reached and threw; no caller input makes that` +
        ` acceptable. Fix it, or add it to route-smoke/known-failures.ts with a` +
        ` reason.${report}\n`,
    ).toEqual([]);
  });

  it('the known-failure list has not grown, and every entry still fails', () => {
    const failingPaths = new Set(results.filter((r) => r.status >= 500).map((r) => r.path));

    expect(
      Object.keys(KNOWN_5XX).length,
      `The known-5xx list is an accepted hole. Adding to it needs a deliberate` +
        ` decision, so the ceiling moves by hand.`,
    ).toBeLessThanOrEqual(MAX_KNOWN_5XX);

    // The other direction matters more: an entry that has quietly started
    // passing must be removed, or the list slowly becomes a place where real
    // regressions can hide unnoticed.
    // Only judge entries the sweep actually visited. A path that is not in the
    // document was never called, so it has not "started passing" — it is
    // absent, which is what FEATURE_BEYOND_CORE does on purpose. Without this
    // the message accuses the wrong thing on any route removal.
    const sweptPaths = new Set(results.map((r) => r.path));
    const fixed = Object.keys(KNOWN_5XX).filter((p) => sweptPaths.has(p) && !failingPaths.has(p));
    expect(
      fixed,
      `These are listed as known 5xx but answered fine. Delete them from` +
        ` route-smoke/known-failures.ts so the list keeps meaning something:` +
        `${fixed.map((p) => `\n  ${p}`).join('')}\n`,
    ).toEqual([]);
  });
});
