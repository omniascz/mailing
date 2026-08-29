/**
 * No /api/v1/internal/* route may carry a guard its caller cannot satisfy.
 *
 * Internal routes are machine-to-machine. Their callers are BullMQ workers and
 * the Go engine, which hold INTERNAL_API_SECRET and nothing else — no cookie,
 * no bearer token, no user. The internal-auth plugin checks that secret for
 * every path under the prefix. Any *additional* session guard on such a route
 * is therefore not defence in depth; it is a closed door with nobody holding
 * the key.
 *
 * That is not hypothetical. routes/v1/sending.ts registered a plugin-wide
 * preHandler calling requireAuth and exempted a single path by name. The
 * internal routes below it were not on that list, so
 * POST /api/v1/internal/sending/warmup/advance-all answered 401 to the nightly
 * cron that is its only caller. warmup_day never advanced: a warming IP stayed
 * on day 1, capped at 50 sends, for as long as it existed. Nothing looked
 * broken, because at the time nothing enforced the cap either. The same bug
 * had already been fixed once in routes/v1/campaigns.ts, where it made every
 * call from the ab-winner worker fail.
 *
 * Two tests, because the failure has two faces:
 *
 *  1. What the router actually composed. printRoutes({ includeHooks: true })
 *     reports the fully resolved hook chain per route, hooks inherited from an
 *     encapsulation context included — the onRoute hook does NOT, it reports
 *     null for those. This catches a guard however it arrived, including one
 *     added globally from another module via fastify-plugin, which no amount
 *     of reading routes/** would reveal.
 *
 *  2. Where it was written. An AST pass over the route files names the file and
 *     line while the author is still looking at it, instead of reporting a
 *     count mismatch after the whole app boots.
 *
 * Neither test sends a request, and that is deliberate. Fastify runs schema
 * validation BEFORE preHandler, so a route with a required body answers 400 to
 * a probe with an empty payload and its preHandler never runs at all. A sweep
 * of injected requests would have missed advance-all had it happened to
 * declare a body schema — 34 of the 66 internal routes answer 400 to exactly
 * that probe. The hook chain does not depend on what we send.
 *
 * This is a unit test on purpose: buildApp() composes every plugin and route
 * without touching Postgres (verified against a dead DATABASE_URL), so it runs
 * in the fast suite on every push rather than only where a database exists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { SCAN_TIMEOUT_MS } from '../test-support/scan-budget.js';

const INTERNAL_PREFIX = '/api/v1/internal/';
const ROUTES_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── 1. what the router composed ─────────────────────────────────────────────

/** `├── /api/v1/internal/events (POST)` — the tree drawing varies, the tail does not. */
const ROUTE_LINE = /^[^/]*(\/\S*)\s+\(([A-Z]+(?:,\s*[A-Z]+)*)\)\s*$/;
/** `│   • (preHandler) ["anonymous()","anonymous()"]` */
const HOOK_LINE = /•\s+\((preHandler|onRequest|preValidation)\)\s+\[(.*)\]\s*$/;

interface RouteHooks {
  route: string;
  onRequest: number;
  preHandler: number;
  preValidation: number;
}

/** Serialised chain lengths — the comparison key, since every hook is anonymous. */
const shapeOf = (r: RouteHooks) =>
  `onRequest:${r.onRequest} preHandler:${r.preHandler} preValidation:${r.preValidation}`;

function internalRouteHooks(app: FastifyInstance): RouteHooks[] {
  const lines = app.printRoutes({ includeHooks: true, commonPrefix: false }).split('\n');
  const out: RouteHooks[] = [];
  let current: RouteHooks | null = null;

  for (const line of lines) {
    const route = ROUTE_LINE.exec(line);
    if (route) {
      current = {
        route: `${route[2]} ${route[1]}`,
        onRequest: 0,
        preHandler: 0,
        preValidation: 0,
      };
      if (route[1]!.startsWith(INTERNAL_PREFIX)) out.push(current);
      continue;
    }
    const hook = HOOK_LINE.exec(line);
    if (hook && current) {
      const list = hook[2]!.trim();
      current[hook[1] as 'onRequest' | 'preHandler' | 'preValidation'] = list
        ? list.split(',').length
        : 0;
    }
  }
  return out;
}

describe('every internal route carries the same hook chain', () => {
  let app: FastifyInstance;
  let routes: RouteHooks[];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    routes = internalRouteHooks(app);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  }, 60_000);

  it('finds the internal routes at all — a silent zero would pass every assertion', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('no internal route has a longer hook chain than the rest', () => {
    // The baseline is the most common shape, not a hard-coded number. Every
    // global plugin (helmet, cors, cookie, audit, internal-auth …) adds to the
    // chain, so a constant would break on unrelated changes and get "fixed" by
    // raising it — which is how a guard quietly dies. The mode moves with the
    // app; what stays visible is one route differing from its peers.
    const tally = new Map<string, number>();
    for (const r of routes) tally.set(shapeOf(r), (tally.get(shapeOf(r)) ?? 0) + 1);
    const baseline = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0]!;
    const expected = Object.fromEntries(
      baseline.split(' ').map((p) => {
        const [k, v] = p.split(':');
        return [k!, Number(v)];
      }),
    ) as Record<string, number>;

    const deviations = routes
      .filter(
        (r) =>
          r.onRequest > expected.onRequest! ||
          r.preHandler > expected.preHandler! ||
          r.preValidation > expected.preValidation!,
      )
      .map((r) => {
        const extra = (['onRequest', 'preHandler', 'preValidation'] as const)
          .filter((k) => r[k] > expected[k]!)
          .map((k) => `${k} ${r[k]} vs ${expected[k]} on every other internal route`)
          .join(', ');
        return `${r.route} — ${extra}`;
      });

    expect(
      deviations,
      deviations.length
        ? `These internal routes carry a guard their callers cannot satisfy ` +
            `(baseline ${baseline}):\n  ${deviations.join('\n  ')}\n` +
            `Callers hold INTERNAL_API_SECRET and no session. Move the guard into ` +
            `a child context via app.register(async (scope) => …) so it reaches ` +
            `only the routes registered inside it.`
        : undefined,
    ).toEqual([]);
  });
});

// ─── 2. where it was written ─────────────────────────────────────────────────

const AUTHY =
  /\b(requireAuth|requireRole|requirePermission|authenticate|requireOwner|requireAdmin)\b/;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);

interface Offence {
  file: string;
  line: number;
  hook: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** True when the hook sits inside an `app.register(…)` callback — an encapsulated child. */
function insideRegister(node: ts.Node): boolean {
  for (let n = node.parent; n; n = n.parent) {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'register'
    ) {
      return true;
    }
  }
  return false;
}

function scanRouteFiles(): Offence[] {
  const offences: Offence[] = [];

  for (const file of walk(ROUTES_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    // Cheap pre-filter: only files that actually register an internal route.
    if (!text.includes(INTERNAL_PREFIX)) continue;

    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let hasInternalRoute = false;
    const authyHooks: ts.CallExpression[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text;
        const first = node.arguments[0];

        if (
          HTTP_METHODS.has(name) &&
          first &&
          (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) &&
          first.text.startsWith(INTERNAL_PREFIX)
        ) {
          hasInternalRoute = true;
        }

        if (
          name === 'addHook' &&
          first &&
          ts.isStringLiteral(first) &&
          ['preHandler', 'onRequest', 'preValidation'].includes(first.text) &&
          node.arguments[1] &&
          AUTHY.test(node.arguments[1].getText(src))
        ) {
          authyHooks.push(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);

    if (!hasInternalRoute) continue;

    for (const hook of authyHooks) {
      // Encapsulation is the only accepted answer. An early return for the
      // prefix inside the hook body also works, and both files here used to do
      // that, but it leaves the guard attached to routes it has no business
      // touching — printRoutes still counts it, and nothing structural keeps
      // the exemption correct as the file grows.
      if (insideRegister(hook)) continue;

      offences.push({
        file: path.relative(ROUTES_DIR, file).split(path.sep).join('/'),
        line: src.getLineAndCharacterOfPosition(hook.getStart(src)).line + 1,
        hook: hook.expression.getText(src),
      });
    }
  }
  return offences;
}

describe('a session guard beside an internal route is encapsulated, not exempted', () => {
  it(
    'no route file guards internal routes by a list of paths to skip',
    () => {
      const offences = scanRouteFiles().map(
        (o) => `${o.file}:${o.line} — ${o.hook}('preHandler', … requireAuth …)`,
      );

      expect(
        offences,
        offences.length
          ? `A plugin-wide auth hook sits in a file that also registers ` +
              `${INTERNAL_PREFIX}* routes:\n  ${offences.join('\n  ')}\n` +
              `Move the guarded routes into app.register(async (scope) => { ` +
              `scope.addHook('preHandler', app.requireAuth); … }) — see ` +
              `routes/v1/video.ts. A skip-list is only as good as the next person ` +
              `who adds a route and does not know it exists.`
          : undefined,
      ).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
