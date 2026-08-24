/**
 * Every path this codebase calls against its own API must exist, and every
 * call to an internal path must carry the shared secret.
 *
 * Both halves have failed silently for months, and they failed together.
 *
 * `fetch` does not reject on a 404. It resolves with `ok: false`, so a call
 * wrapped in `.catch(() => {})` — or in a try/catch, or in nothing at all —
 * reports success against a path that does not exist. Nothing throws, nothing
 * logs, and the caller carries on. That is why five call sites in apps/api
 * spent months POSTing to `/api/v1/internal/workflows/trigger`,
 * `/internal/schedule-job`, `/internal/notifications` and
 * `/internal/phone/transcribe`, none of which has ever been registered in any
 * commit in this repo's history, without anyone noticing. Four of them also
 * sent no `x-internal-secret`, so fixing only the path would have turned a
 * silent 404 into a silent 401.
 *
 * The two in apps/workers were worse than cosmetic:
 *
 *   - `POST /internal/frequency/record` — the write half of the frequency cap.
 *     `checkFrequencyCap` counts members of a Redis sorted set that only
 *     `recordSend` writes, and the sole other caller of `recordSend` is its own
 *     unit test. The set was always empty, so the cap never capped.
 *
 *   - `POST /internal/suppressions` — called on every hard bounce. The address
 *     never reached the suppression list the send path consults, so the next
 *     campaign mailed it again.
 *
 * The truth source here is the router, asked directly. Not a hand-kept list,
 * and not the text of `printRoutes()` either: parsing that output during the
 * probe that led to this test dropped five real routes whose path is a prefix
 * of another (`rfm/refresh` beside `rfm/refresh-all`), which nearly produced a
 * false report. `hasRoute()` is no good either — it compares the registered
 * pattern literally, so `/api/v1/tags/abc` does not match `/api/v1/tags/:id`.
 * `findRoute()` performs the real lookup, parameters and static-segment
 * priority included. That last part matters: `POST /api/v1/contacts/bulk` looks
 * covered by `/api/v1/contacts/:id` to any textual comparison, and 404s in
 * practice.
 *
 * A unit test on purpose: `buildApp()` composes every plugin and route without
 * touching Postgres, so this runs on every push rather than only where a
 * database exists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const ROOTS = [path.join(REPO, 'apps', 'api', 'src'), path.join(REPO, 'apps', 'workers', 'src')];
const INTERNAL_PREFIX = '/api/v1/internal/';
const SECRET_HEADER = 'x-internal-secret';

/** Stand-in for an interpolated path segment; findRoute matches it to `:param`. */
const PARAM = 'x1x';

interface CallSite {
  file: string;
  line: number;
  method: string;
  /** Path from `/api/v1/` onwards, with `${…}` where the source interpolated. */
  raw: string;
  /** True when the path or method could not be read statically. */
  dynamic: boolean;
  sendsSecret: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.next'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Reads a string/template/concatenation, marking interpolated holes. */
function literalOf(node: ts.Node, src: ts.SourceFile): { text: string; dynamic: boolean } | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { text: node.text, dynamic: false };
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) text += '${…}' + span.literal.text;
    return { text, dynamic: true };
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalOf(node.left, src);
    const right = literalOf(node.right, src);
    if (left && right)
      return { text: left.text + right.text, dynamic: left.dynamic || right.dynamic };
    if (left) return { text: left.text + '${…}', dynamic: true };
    if (right) return { text: '${…}' + right.text, dynamic: true };
  }
  return null;
}

function collectCallSites(): CallSite[] {
  const sites: CallSite[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes('/api/v1/')) continue;
      const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const rel = path.relative(REPO, file).split(path.sep).join('/');

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && /^(fetch|safeFetch)$/.test(node.expression.getText(src))) {
          const url = literalOf(node.arguments[0]!, src);
          if (url && url.text.includes('/api/v1/')) {
            const raw = url.text.slice(url.text.indexOf('/api/v1/'));
            const opts = node.arguments[1];

            let method = 'GET';
            let dynamicMethod = false;
            let sendsSecret = false;

            if (opts && ts.isObjectLiteralExpression(opts)) {
              for (const prop of opts.properties) {
                const name = prop.name?.getText(src);
                if (name === 'method' && ts.isPropertyAssignment(prop)) {
                  const lit = literalOf(prop.initializer, src);
                  if (lit && !lit.dynamic) method = lit.text.toUpperCase();
                  else dynamicMethod = true;
                }
                if (name === 'headers') {
                  // Either spelled out here, or produced by a helper named
                  // for the job — internalHeaders() and internalGetHeaders()
                  // in apps/workers/src/lib/internal-api.ts, which differ only
                  // in whether they add a content type. Matching on the name is
                  // coarse, and deliberately so: resolving the callee would
                  // mean type-checking the workers package from here. A helper
                  // that carries the word and does not set the header is the
                  // one way past this, and it is a strange thing to write.
                  const headerText = prop.getText(src);
                  sendsSecret =
                    headerText.toLowerCase().includes(SECRET_HEADER) ||
                    /internal\w*Headers\s*\(/i.test(headerText);
                }
              }
            }

            sites.push({
              file: rel,
              line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1,
              method,
              raw,
              // A hole that is only part of a segment (a query string, say)
              // cannot be substituted honestly — `/api/v1/contacts${qs}`
              // becomes `/api/v1/contactsx1x`, which matches nothing.
              dynamic:
                dynamicMethod ||
                raw
                  .split('?')[0]!
                  .split('/')
                  .some((seg) => seg.includes('${…}') && seg !== '${…}'),
              sendsSecret,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
  }
  return sites;
}

/**
 * Call sites whose path or method cannot be read statically, and so are not
 * checked against the router. Frozen at the current count — zero — because the
 * cheapest way to silence this test would be to rewrite a call into a shape the
 * scanner cannot read. Every interpolation in the codebase today fills a whole
 * path segment, which findRoute resolves against `:param` perfectly well; the
 * unreadable shape is a hole inside a segment, like `/api/v1/contacts${qs}`.
 */
const DYNAMIC_CALL_SITES_MAX = 0;

describe('every call to our own API resolves to a route', () => {
  let app: FastifyInstance;
  let sites: CallSite[];
  let findRoute: (opts: { method: string; url: string }) => unknown;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    findRoute = (opts) =>
      (app as unknown as { findRoute: (o: { method: string; url: string }) => unknown }).findRoute(
        opts,
      );
    sites = collectCallSites();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  }, 60_000);

  it('finds the call sites at all — a silent zero would pass every assertion', () => {
    // 28 today across apps/api and apps/workers. A floor, not a target:
    // it only fails if calls stop being found, which is how a broken scanner
    // would otherwise look identical to a clean codebase.
    expect(sites.length).toBeGreaterThanOrEqual(28);
  });

  it('no call targets a path the router will not match', () => {
    const checkable = sites.filter((s) => !s.dynamic);
    const broken: string[] = [];

    for (const site of checkable) {
      const url =
        site.raw
          .split('?')[0]!
          .replace(/\$\{…\}/g, PARAM)
          .replace(/\/+$/, '') || '/';
      let found = false;
      try {
        found = !!findRoute({ method: site.method, url });
      } catch {
        found = false;
      }
      if (found) continue;

      // Present under a different verb is a different, smaller mistake — say
      // which, because "route missing" would send the reader looking for the
      // wrong thing.
      const others = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => {
        if (m === site.method) return false;
        try {
          return !!findRoute({ method: m, url });
        } catch {
          return false;
        }
      });
      broken.push(
        `${site.file}:${site.line} — ${site.method} ${site.raw}` +
          (others.length ? `  (registered as ${others.join('/')})` : '  (no such route)'),
      );
    }

    expect(
      broken,
      broken.length
        ? `These calls go to a path the router does not serve:\n  ${broken.join('\n  ')}\n` +
            `fetch resolves on a 404, so none of them will throw — the caller ` +
            `will read this as success. Register the route, or call the ` +
            `function directly if the target lives in this process.`
        : undefined,
    ).toEqual([]);
  });

  it('every internal call carries the shared secret', () => {
    // Path and credential went missing together in four of the five call sites
    // this test was written for, so correcting only the path would have swapped
    // a silent 404 for a silent 401 — which is exactly how
    // /internal/sending/warmup/advance-all went unnoticed for months.
    const naked = sites
      .filter((s) => s.raw.startsWith(INTERNAL_PREFIX) && !s.sendsSecret)
      .map((s) => `${s.file}:${s.line} — ${s.method} ${s.raw}`);

    expect(
      naked,
      naked.length
        ? `These calls to ${INTERNAL_PREFIX}* send no ${SECRET_HEADER}:\n  ${naked.join('\n  ')}\n` +
            `The internal-auth plugin answers 401 to every one of them, and ` +
            `fetch does not reject on a 401 either.`
        : undefined,
    ).toEqual([]);
  });

  it('the unreadable call sites do not multiply', () => {
    const dynamic = sites.filter((s) => s.dynamic).map((s) => `${s.file}:${s.line} — ${s.raw}`);
    expect(
      dynamic.length,
      `Call sites whose path or method cannot be read statically:\n  ${dynamic.join('\n  ')}`,
    ).toBeLessThanOrEqual(DYNAMIC_CALL_SITES_MAX);
  });
});
