#!/usr/bin/env node
/**
 * Writes keyed by an id the caller handed us, on a route that never mentions
 * the caller's organization.
 *
 * ─── Why this exists as its own check ────────────────────────────────────────
 *
 * `forgemsgOrg/require-org-scope` deliberately exempts
 * `update(t).where(eq(t.id, x))` as a lookup by primary key — "as narrow as a
 * query can be". That held for all 603 warnings it was written against, where
 * the id came from a lookup the same function had already scoped. It does not
 * hold when the id arrives in a request body or path: a primary key supplied by
 * a stranger narrows nothing. Three defects have now been found in that blind
 * spot (push click tracking, RCS status, the BulkGate DLR), and none of them
 * could ever appear in docs/ORG-SCOPE-AUDIT.md, because that document is the
 * triage of the rule's warnings and the rule never reported them.
 *
 * Extending the rule was measured and rejected: within one file it would add
 * seventeen warnings, all seventeen of them safe, and it would still have
 * missed every real defect, because in each the write lives in a service and
 * the request lives in a route. So the check crosses that boundary instead, and
 * lives here rather than in ESLint.
 *
 * ─── What it reports ─────────────────────────────────────────────────────────
 *
 * One signal, chosen because it is what the three defects had in common and the
 * safe cases do not: a route handler that performs a keyed write — itself, or
 * through a service function one call away — and in which the string `orgId`
 * never appears. A handler that checks ownership mentions the org; a handler
 * that forgot to has nothing to mention.
 *
 * Not a pinned count. A number moves with every refactor and says nothing about
 * which write moved; this prints the route, the file and line, the guard and the
 * table, and fails on anything not in the allowlist beside it. Entries are keyed
 * by route rather than by line, because line numbers shift under any edit — the
 * org-scope audit says so itself.
 *
 * Usage:  node scripts/org-scope-write-sweep.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ROOTS = ['apps/api/src', 'apps/workers/src'].map((p) => path.join(REPO, p));
const ALLOWLIST = path.join(HERE, 'org-scope-write-allowlist.json');

/** Same files the lint rule skips: fixtures there span tenants on purpose. */
const SKIP = /(\.test\.ts$)|([\\/]integration[\\/])|([\\/]test-support[\\/])/;

const WRITE_KINDS = new Set(['update', 'delete', 'insert']);
const CARRIERS = new Set(['where', 'values', 'onConflictDoUpdate', 'set']);

function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  else if (p.endsWith('.ts') && !SKIP.test(p)) out.push(p);
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const sources = new Map();
const srcOf = (file) => {
  if (!sources.has(file)) {
    sources.set(
      file,
      ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true),
    );
  }
  return sources.get(file);
};

const nodesOf = (node) => {
  const out = [];
  const visit = (n) => {
    out.push(n);
    n.forEachChild(visit);
  };
  visit(node);
  return out;
};

/** `db.update(x).set(y).where(z)` flattened into [{method,node}], outermost in. */
function chainOf(call) {
  const calls = [];
  let n = call;
  while (n && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
    calls.push({ method: n.expression.name.text, node: n });
    n = n.expression.expression;
  }
  return calls.reverse();
}

const isInner = (call) =>
  call.parent && ts.isPropertyAccessExpression(call.parent) && call.parent.expression === call;

const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

/** Keyed writes with no org in their predicate, anywhere in the tree. */
function keyedWrites(sf) {
  const found = [];
  for (const n of nodesOf(sf)) {
    if (!ts.isCallExpression(n) || isInner(n)) continue;
    const chain = chainOf(n);
    const head = chain[0];
    if (!head || !WRITE_KINDS.has(head.method)) continue;

    const receiver = ts.isPropertyAccessExpression(head.node.expression)
      ? head.node.expression.expression.getText()
      : '';
    if (!/^(db|tx|trx|this\.db)$/.test(receiver)) continue;

    const methods = chain.map((c) => c.method);
    if (head.method === 'insert' && !methods.includes('onConflictDoUpdate')) continue;

    const carriers = chain.filter((c) => CARRIERS.has(c.method));
    const scoped = carriers.some((c) =>
      c.node.arguments.some((a) => /\borgId\b|\borg_id\b/.test(a.getText())),
    );
    if (scoped) continue;

    const table = head.node.arguments[0]?.getText() ?? '?';
    found.push({ node: n, table, kind: head.method, line: lineOf(sf, n) });
  }
  return found;
}

/** Innermost named function containing a line, for the service index. */
function functionNameAt(sf, line) {
  let best = null;
  for (const n of nodesOf(sf)) {
    const named =
      ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)
        ? n.name?.getText()
        : (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
            n.parent &&
            ts.isVariableDeclaration(n.parent)
          ? n.parent.name.getText()
          : null;
    if (!named) continue;
    const start = lineOf(sf, n);
    const end = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
    if (line < start || line > end) continue;
    if (!best || start > best.start) best = { name: named, start };
  }
  return best?.name ?? null;
}

// ── 1. index service functions whose body holds an unscoped keyed write ──────
//
// Keyed by file AND name, never by name alone. Eight function names in this
// repository are declared more than once — the org-scope audit lists them — and
// `send` is a method on half the adapters and on every Fastify reply, so a
// name-only index attributes the push adapter's writes to every route that
// answers with reply.send().
const serviceWrites = new Map(); // "<file>#<fn>" → [{file, line, table, kind}]
for (const file of files) {
  const sf = srcOf(file);
  for (const w of keyedWrites(sf)) {
    const fn = functionNameAt(sf, w.line);
    if (!fn) continue;
    const key = `${file}#${fn}`;
    if (!serviceWrites.has(key)) serviceWrites.set(key, []);
    serviceWrites.get(key).push({ file: rel(file), line: w.line, table: w.table, kind: w.kind });
  }
}

/** Resolve a module specifier the way the compiler would, .js → .ts included. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    path.join(base, 'index.ts'),
    base.replace(/\.js$/, '/index.ts'),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/** localName → file it was imported from, for static and dynamic imports. */
function importMap(sf, file) {
  const map = new Map();
  for (const n of nodesOf(sf)) {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const target = resolveImport(file, n.moduleSpecifier.text);
      if (!target) continue;
      const named = n.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) map.set(el.name.text, target);
      }
      continue;
    }
    // const { x } = await import('./y.js')
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isAwaitExpression(n.initializer) &&
      ts.isCallExpression(n.initializer.expression) &&
      n.initializer.expression.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = n.initializer.expression.arguments[0];
      if (!arg || !ts.isStringLiteral(arg)) continue;
      const target = resolveImport(file, arg.text);
      if (!target) continue;
      if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) map.set(el.name.getText(), target);
      }
    }
  }
  return map;
}

// ── 2. walk route registrations ──────────────────────────────────────────────
const findings = [];
for (const file of files) {
  const sf = srcOf(file);
  const text = fs.readFileSync(file, 'utf8');
  const fileLevelHook = /app\.addHook\(\s*['"]preHandler['"]/.test(text);
  const imports = importMap(sf, file);

  for (const n of nodesOf(sf)) {
    if (
      !ts.isCallExpression(n) ||
      !ts.isPropertyAccessExpression(n.expression) ||
      !ts.isIdentifier(n.expression.expression) ||
      n.expression.expression.text !== 'app' ||
      !/^(get|post|put|patch|delete|head|options|all)$/.test(n.expression.name.text)
    )
      continue;

    const first = n.arguments[0];
    if (!first || !ts.isStringLiteral(first)) continue;
    const route = `${n.expression.name.text.toUpperCase()} ${first.text}`;

    // The handler is the last argument; the options object, if any, is before.
    const handler = n.arguments[n.arguments.length - 1];
    if (!handler || (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler))) continue;

    // A handler that checks ownership names the org somewhere; one that forgot
    // has nothing to name. Identifiers rather than a regex over the text: the
    // BulkGate DLR handler carried the comment "Resolve orgId from DLR data"
    // above code that did no such thing, and a textual test read that as
    // scoped — so the first thing this check's own self-test caught was this
    // check being wrong.
    const namesOrg = nodesOf(handler).some((x) => ts.isIdentifier(x) && x.text === 'orgId');
    if (namesOrg) continue;

    const opts = n.arguments.length > 2 ? n.arguments[1] : null;
    const optsText = opts ? opts.getText() : '';
    const guardMatch = /preHandler:\s*\[([^\]]*)\]/.exec(optsText);
    const guard = guardMatch
      ? guardMatch[1].replace(/\s+/g, ' ').trim()
      : fileLevelHook
        ? 'file-level addHook'
        : 'NONE';

    const writes = [];
    // direct writes inside the handler
    for (const w of keyedWrites(sf)) {
      if (w.node.getStart() >= handler.getStart() && w.node.getEnd() <= handler.getEnd()) {
        writes.push(`${rel(file)}:${w.line} (${w.kind} ${w.table})`);
      }
    }
    // Writes one call away, through a function this file imported. Only bare
    // identifier calls: `reply.send()` and `adapter.send()` are not calls to an
    // imported function, and treating them as such is how a name-only index
    // reports every route in the repository.
    for (const inner of nodesOf(handler)) {
      if (!ts.isCallExpression(inner) || !ts.isIdentifier(inner.expression)) continue;
      const callee = inner.expression.text;
      const from = imports.get(callee);
      if (!from) continue;
      const hits = serviceWrites.get(`${from}#${callee}`);
      if (!hits) continue;
      for (const w of hits) {
        writes.push(`${w.file}:${w.line} (${w.kind} ${w.table}, via ${callee}())`);
      }
    }

    if (writes.length === 0) continue;
    findings.push({
      route,
      at: `${rel(file)}:${lineOf(sf, n)}`,
      guard,
      writes: [...new Set(writes)],
    });
  }
}

findings.sort((a, b) => (a.route < b.route ? -1 : 1));

// ── 3. compare with the allowlist ────────────────────────────────────────────
const allow = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
const allowed = new Set(Object.keys(allow.routes));

const asJson = process.argv.includes('--json');
if (asJson) console.log(JSON.stringify(findings, null, 2));
/** Human output goes to stderr under --json so the JSON stays parseable. */
const say = (line) => (asJson ? console.error(line) : console.log(line));

const unexpected = findings.filter((f) => !allowed.has(f.route));
const stale = [...allowed].filter((r) => !findings.some((f) => f.route === r));
const open = findings.filter((f) => allow.routes[f.route]?.status === 'known-open');

for (const f of findings.filter((f) => allowed.has(f.route))) {
  const entry = allow.routes[f.route];
  const mark = entry.status === 'known-open' ? 'OPEN' : 'ok  ';
  say(`  ${mark} ${f.route}`);
  if (entry.status === 'known-open') say(`       ${entry.why}`);
}

if (open.length > 0) {
  // Printed, not swallowed. An entry that says "this is still wrong" must not
  // read the same as one that says "this is fine", or the list becomes a place
  // findings go to be forgotten.
  say(`\n${open.length} allowlisted route(s) are marked KNOWN OPEN above.`);
}

if (unexpected.length === 0 && stale.length === 0) {
  say(
    `\norg-scope write sweep: ${findings.length} known (${open.length} known-open), 0 unexpected.`,
  );
  process.exit(0);
}

if (unexpected.length > 0) {
  console.error(`\n${unexpected.length} route(s) write by a caller-supplied key and never`);
  console.error('mention the caller\'s organization:\n');
  for (const f of unexpected) {
    console.error(`  ${f.route}`);
    console.error(`    registered at ${f.at}   guard: ${f.guard}`);
    for (const w of f.writes) console.error(`    writes ${w}`);
    console.error('');
  }
  console.error('Either scope the write by the caller\'s org, or — if the id is a credential in');
  console.error('its own right (a signed token, a webhook secret, a public identifier) — add the');
  console.error(`route to ${rel(ALLOWLIST)} with the reason. A reason, not just the route.`);
}

if (stale.length > 0) {
  console.error(`\n${stale.length} allowlist entr(ies) match nothing any more:\n`);
  for (const r of stale) console.error(`  ${r}  — ${allow.routes[r].why}`);
  console.error('\nThe route was renamed, removed, or fixed. Drop the entry.');
}

process.exit(1);
