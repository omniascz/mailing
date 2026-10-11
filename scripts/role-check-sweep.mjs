#!/usr/bin/env node
/**
 * Routes that change state for a signed-in caller and never check the caller's
 * role.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * requireAuth says who is calling; it does not say what they may do. Z127
 * measured a viewer sending a campaign, Z129 counted 513 state-changing routes
 * that a viewer can call, and Z130 measured the worst of them: a viewer minting
 * an API key that acted as admin. Those routes are not all wrong — many are
 * fine for any member — but each one is a decision nobody wrote down. This
 * check keeps the number from growing while they are decided, the way the
 * org-scope write sweep beside it does for unscoped writes.
 *
 * ─── What it reports ─────────────────────────────────────────────────────────
 *
 * Every POST, PUT, PATCH and DELETE registered in apps/api/src (tests and
 * integration suites skipped) that
 *   - is authenticated: requireAuth, authenticate or authenticatePublic in its
 *     own preHandler/onRequest, in an options object it names, or in a
 *     preHandler/onRequest hook added in any function that encloses the
 *     registration (Fastify applies a plugin's hooks to every route registered
 *     inside it, nested registers included);
 *   - and has no role check (requireRole, requireSystemAdmin) in any of those
 *     places. A check inside the handler does not count: it can sit behind a
 *     condition, as on POST /broadcasts.
 * A route with no authentication at all is not reported: it has no member
 * whose role could be checked — public intake, tracking, webhooks and
 * /internal/* (behind its own secret) are that kind.
 *
 * ─── How it fails ────────────────────────────────────────────────────────────
 *
 *   - a finding that is neither in the baseline nor an exemption: a new route
 *     without a role check;
 *   - a baseline entry that matches no finding: a route got its role check (or
 *     went away) and the baseline was not updated in the same change — so the
 *     baseline only ever shrinks on purpose, and says so in the diff;
 *   - an exact exemption that matches no finding: the same, for the exemptions.
 *
 * Keyed by "METHOD path", not by line: line numbers shift under any edit.
 *
 * Usage:  node scripts/role-check-sweep.mjs            check
 *         node scripts/role-check-sweep.mjs --json     findings as JSON
 *         node scripts/role-check-sweep.mjs --write-baseline
 *                                                     rewrite the baseline from
 *                                                     the current findings (then
 *                                                     review the diff)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ROOT = path.join(REPO, 'apps/api/src');
const BASELINE = path.join(HERE, 'role-check-baseline.json');
const EXEMPTIONS = path.join(HERE, 'role-check-exemptions.json');

const SKIP = /(\.test\.ts$)|([\\/]integration[\\/])|([\\/]test-support[\\/])/;
const MUTATING = new Set(['post', 'put', 'patch', 'delete']);
const AUTH = /\b(requireAuth|authenticate|authenticatePublic)\b/;
const ROLE = /\b(requireRole|requireSystemAdmin)\b/;
const HOOKS = new Set(['preHandler', 'onRequest']);

function walk(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  else if (p.endsWith('.ts') && !SKIP.test(p)) out.push(p);
  return out;
}

const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');

const nodesOf = (node) => {
  const out = [];
  const visit = (n) => {
    out.push(n);
    n.forEachChild(visit);
  };
  visit(node);
  return out;
};

const isFunction = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

/** The functions enclosing a node, innermost first. */
function enclosingFunctions(n) {
  const out = [];
  for (let p = n.parent; p; p = p.parent) if (isFunction(p)) out.push(p);
  return out;
}

/** `const auth = { preHandler: [...] }` and similar, by name, for one file. */
function constObjects(sf) {
  const map = new Map();
  for (const n of nodesOf(sf)) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      map.set(n.name.text, n.initializer.getText());
    }
  }
  return map;
}

/** `const prefix = '/api/v1/lead-scoring'`, by name, for one file. */
function constStrings(sf) {
  const map = new Map();
  for (const n of nodesOf(sf)) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))
    )
      map.set(n.name.text, n.initializer.text);
  }
  return map;
}

/**
 * A route path as written: a string, a template, a concatenation, with the
 * file's string constants filled in (`${prefix}/rules`). A part that is not a
 * constant stays as its source, so a route registered in a loop keeps a stable
 * key (`/batch/:batchId/${verb}`). null when this is not a path at all.
 */
function pathOf(node, strings) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return strings.get(node.text) ?? null;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      out += pathOf(span.expression, strings) ?? `\${${span.expression.getText()}}`;
      out += span.literal.text;
    }
    return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = pathOf(node.left, strings);
    const r = pathOf(node.right, strings);
    return l !== null && r !== null ? l + r : null;
  }
  if (ts.isParenthesizedExpression(node)) return pathOf(node.expression, strings);
  return null;
}

/** The text a route's options stand for, with the options objects it names spelled out. */
function optionsText(opts, consts) {
  if (!opts) return '';
  let text = opts.getText();
  for (const n of nodesOf(opts)) {
    if (ts.isIdentifier(n) && consts.has(n.text)) text += `\n${consts.get(n.text)}`;
  }
  return text;
}

/** preHandler/onRequest hooks added with addHook, keyed by the function they were added in. */
function hooksByFunction(sf, consts) {
  const map = new Map(); // function node → [hook text]
  for (const n of nodesOf(sf)) {
    if (
      !ts.isCallExpression(n) ||
      !ts.isPropertyAccessExpression(n.expression) ||
      n.expression.name.text !== 'addHook'
    )
      continue;
    const [kind, fn] = n.arguments;
    if (!kind || !ts.isStringLiteral(kind) || !HOOKS.has(kind.text) || !fn) continue;
    let text = fn.getText();
    if (ts.isIdentifier(fn) && consts.has(fn.text)) text += `\n${consts.get(fn.text)}`;
    const owner = enclosingFunctions(n)[0] ?? sf;
    if (!map.has(owner)) map.set(owner, []);
    map.get(owner).push(text);
  }
  return map;
}

export function sweep(files = walk(ROOT)) {
  const findings = [];
  for (const file of files) {
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const consts = constObjects(sf);
    const strings = constStrings(sf);
    const hooks = hooksByFunction(sf, consts);

    for (const n of nodesOf(sf)) {
      if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) continue;
      const method = n.expression.name.text;
      if (!MUTATING.has(method)) continue;
      const first = n.arguments[0];
      if (!first) continue;
      // A route path: a string, or a template/expression for routes registered
      // in a loop. Anything else (`reply.delete`, `map.delete(key)`) is not one.
      const routePath = pathOf(first, strings);
      if (!routePath || !routePath.startsWith('/')) continue;
      const handler = n.arguments[n.arguments.length - 1];
      if (
        !handler ||
        !(
          ts.isArrowFunction(handler) ||
          ts.isFunctionExpression(handler) ||
          ts.isIdentifier(handler)
        )
      )
        continue;
      if (n.arguments.length < 2) continue;

      const opts = n.arguments.length > 2 ? n.arguments[1] : null;
      const own = optionsText(opts, consts);
      const inherited = enclosingFunctions(n)
        .concat([sf])
        .flatMap((f) => hooks.get(f) ?? []);
      const guardText = [own, ...inherited].join('\n');

      const authenticated = AUTH.test(guardText) || ROLE.test(guardText);
      if (!authenticated) continue;
      // Only a check every request passes through counts. A requireRole call
      // inside the handler can sit behind a condition — POST /broadcasts checks
      // the role only when the request also schedules — so it does not.
      if (ROLE.test(guardText)) continue;

      findings.push({
        route: `${method.toUpperCase()} ${routePath}`,
        file: rel(file),
        line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        // Only SDK-style intake auth: a publishable key is accepted here.
        public:
          /\bauthenticatePublic\b/.test(guardText) &&
          !/\b(requireAuth|authenticate)\b/.test(guardText),
      });
    }
  }
  findings.sort((a, b) =>
    a.route < b.route ? -1 : a.route > b.route ? 1 : a.file < b.file ? -1 : 1,
  );
  // Two registrations of one method+path (it happens across modules): keep
  // both, told apart by file.
  const seen = new Map();
  for (const f of findings) seen.set(f.route, (seen.get(f.route) ?? 0) + 1);
  for (const f of findings) f.key = seen.get(f.route) > 1 ? `${f.route} [${f.file}]` : f.route;
  return findings;
}

function exemptionFor(f, exemptions) {
  return exemptions.find((e) =>
    e.route ? e.route === f.key : e.prefix ? f.route.split(' ')[1].startsWith(e.prefix) : false,
  );
}

function main() {
  const findings = sweep();
  const asJson = process.argv.includes('--json');
  const exemptions = JSON.parse(fs.readFileSync(EXEMPTIONS, 'utf8')).exemptions;
  const counted = findings.filter((f) => !exemptionFor(f, exemptions));

  if (process.argv.includes('--write-baseline')) {
    const routes = Object.fromEntries(counted.map((f) => [f.key, f.file]));
    const files = new Set(counted.map((f) => f.file));
    const doc = {
      _: [
        'State-changing routes for a signed-in caller with no role check, as they stand.',
        'Written by: node scripts/role-check-sweep.mjs --write-baseline. CI fails when a',
        'route is added here, and when one is gone from the code but still listed here.',
        'Fixing a route means deleting its line in the same change. Intentional',
        'exceptions do not belong here: they are in role-check-exemptions.json.',
      ],
      count: counted.length,
      files: files.size,
      routes,
    };
    fs.writeFileSync(BASELINE, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`baseline written: ${counted.length} routes in ${files.size} files`);
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(findings, null, 2));
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).routes;
  const keys = new Set(counted.map((f) => f.key));
  const added = counted.filter((f) => !(f.key in baseline));
  const gone = Object.keys(baseline).filter((k) => !keys.has(k));
  const staleExemptions = exemptions.filter(
    (e) => e.route && !findings.some((f) => f.key === e.route),
  );

  const exempted = findings.length - counted.length;
  if (added.length === 0 && gone.length === 0 && staleExemptions.length === 0) {
    console.log(
      `role-check sweep: ${counted.length} routes without a role check, all in the baseline ` +
        `(${new Set(counted.map((f) => f.file)).size} files); ${exempted} exempted on purpose. ` +
        `0 new, 0 fixed-but-still-listed.`,
    );
    process.exit(0);
  }
  if (added.length > 0) {
    console.error(`\n${added.length} new state-changing route(s) without a role check:\n`);
    for (const f of added) console.error(`  ${f.key}\n    ${f.file}:${f.line}`);
    console.error(
      '\nGive it a role check (app.requireRole(...) in its preHandler). If any member\n' +
        'may call it on purpose, add it to scripts/role-check-exemptions.json with the reason.',
    );
  }
  if (gone.length > 0) {
    console.error(
      `\n${gone.length} baseline entr(ies) match no route without a role check any more:\n`,
    );
    for (const k of gone) console.error(`  ${k}   (${baseline[k]})`);
    console.error(
      '\nThe route got its role check, or was renamed or removed. Delete the line from\n' +
        'scripts/role-check-baseline.json in this same change (or run --write-baseline and\n' +
        'review the diff), so the baseline says what was fixed.',
    );
  }
  if (staleExemptions.length > 0) {
    console.error(`\n${staleExemptions.length} exemption(s) match nothing any more:\n`);
    for (const e of staleExemptions) console.error(`  ${e.route} — ${e.why}`);
    console.error('\nDrop them from scripts/role-check-exemptions.json.');
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) main();
