/**
 * Every workflow trigger type must be creatable and must actually fire.
 *
 * This is the guard for the class of bug this change fixes. Four values of
 * `workflowTriggerTypeEnum` — form_submit, lifecycle_stage_changed,
 * loyalty_points_earned, loyalty_reward_redeemed — could be picked in the UI,
 * accepted by the API, saved, and activated, and nothing anywhere ever queried
 * them. The customer got a workflow marked Active that never ran once, with no
 * error and nothing in a log. Two more, segment_entered and segment_exited,
 * had the opposite defect: the odpalovač and its cron ran every five minutes
 * while the API's Zod enum answered 400, so no such workflow could exist. And
 * six trigger names were queried through `'x' as never` casts for values the
 * enum does not contain, so those queries matched zero rows by construction.
 *
 * Nothing in the type system connected any of it: a pgEnum, a Zod array, a
 * list of UI tiles and a set of call sites are four separate lists of strings.
 * So this connects them by parsing.
 *
 * A grep cannot do this job. 'form_submit' appears in the enum, in the Zod
 * array, in the UI tiles, in two gallery templates and in this file — text
 * search cannot tell a definition from an odpálení. Invariant (3) in
 * particular has to follow calls: `purchase_event` is never written next to
 * `workflows.triggerType`; it reaches the query as an argument to
 * `startTypedWorkflows`, two frames down from the function that has a caller.
 *
 * Source of truth is `workflowTriggerTypeEnum.enumValues`, imported rather
 * than re-parsed, so the enum cannot drift from what this test believes it is.
 *
 * Unit test on purpose: it reads files, needs no database, and so runs in the
 * fast suite on every push rather than only where Postgres exists.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workflowTriggerTypeEnum } from '../../db/schema/workflows.js';
import { WORKFLOW_TEMPLATES } from '../workflow-templates/registry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_SRC = path.resolve(HERE, '../..');
const REPO = path.resolve(API_SRC, '../../..');
const TRIGGERS_FILE = path.join(HERE, 'triggers.ts');
const ROUTE_FILE = path.join(API_SRC, 'routes/v1/workflows.ts');
const UI_FILE = path.join(REPO, 'apps/web/src/app/(dashboard)/workflows/new/new-workflow-form.tsx');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.next', 'coverage']);

/** The one list everything else is checked against. */
const ENUM_VALUES = workflowTriggerTypeEnum.enumValues as readonly string[];

/**
 * Trigger types that are fired by workflow id rather than by matching on the
 * type, so invariant (3) cannot see them. Each needs a reason and the function
 * that does the firing; the function is asserted to have a production caller
 * below, so an exception cannot quietly rot into a dead one.
 */
const BY_ID_TRIGGERS: Record<string, { via: string; why: string }> = {
  manual: {
    via: 'triggerManual',
    why: 'Started by workflow id from POST /workflows/:id/trigger and from a signup form whose config names a workflowId. It never matches on trigger type, so no query mentions it.',
  },
};

/**
 * Enum values the "new workflow" UI deliberately does not offer.
 * Must stay empty unless there is a real reason written here: a trigger the
 * API accepts but the UI hides is reachable only by API callers, which is the
 * milder half of the same dishonesty this file exists to prevent.
 */
const ALLOWED_HIDDEN_IN_UI: Record<string, string> = {};

// ─── AST helpers ──────────────────────────────────────────────────────────────

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, fn: (n: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, (c) => walk(c, fn));
}

/**
 * Strip the wrappers that hide a string literal from `isStringLiteralLike`.
 * `'consent_granted' as never` was exactly how six dead trigger names stayed
 * invisible to the compiler and to any check that did not do this.
 */
function unwrap(node: ts.Node | undefined): ts.Node | undefined {
  let n = node;
  while (
    n &&
    (ts.isAsExpression(n) ||
      ts.isSatisfiesExpression(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isTypeAssertionExpression(n))
  ) {
    n = n.expression;
  }
  return n;
}

function literal(node: ts.Node | undefined): string | null {
  const n = unwrap(node);
  return n && ts.isStringLiteralLike(n) ? n.text : null;
}

function calleeName(call: ts.CallExpression): string {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return '';
}

/** `eq(workflows.triggerType, X)` / `inArray(workflows.triggerType, [X, …])`. */
function triggerTypeComparison(call: ts.CallExpression): ts.Node[] {
  const fn = calleeName(call);
  if (fn !== 'eq' && fn !== 'ne' && fn !== 'inArray') return [];
  const subject = call.arguments[0];
  if (!subject || !/(^|\.)triggerType$/.test(subject.getText().trim())) return [];
  const value = unwrap(call.arguments[1]);
  if (!value) return [];
  return ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const isTestFile = (file: string): boolean =>
  /\.(test|spec)\.tsx?$/.test(file) || file.split(path.sep).includes('__tests__');

const rel = (file: string): string => path.relative(REPO, file).split(path.sep).join('/');

// ─── (3a) Call graph inside triggers.ts ───────────────────────────────────────

interface TriggerFn {
  exported: boolean;
  params: string[];
  /** Literals compared directly against workflows.triggerType in this body. */
  direct: Set<string>;
  /** Calls to other functions declared in this same file. */
  localCalls: Array<{ name: string; args: Array<string | null> }>;
}

function buildTriggerGraph(): Map<string, TriggerFn> {
  const src = parse(TRIGGERS_FILE);
  const fns = new Map<string, TriggerFn>();
  const nodes = new Map<string, ts.FunctionDeclaration>();

  walk(src, (n) => {
    if (!ts.isFunctionDeclaration(n) || !n.name) return;
    nodes.set(n.name.text, n);
    fns.set(n.name.text, {
      exported: !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
      params: n.parameters.map((p) => p.name.getText()),
      direct: new Set(),
      localCalls: [],
    });
  });

  for (const [name, node] of nodes) {
    const info = fns.get(name)!;
    walk(node, (n) => {
      if (!ts.isCallExpression(n)) return;
      for (const value of triggerTypeComparison(n)) {
        const lit = literal(value);
        if (lit) info.direct.add(lit);
      }
      const callee = calleeName(n);
      if (callee !== name && nodes.has(callee)) {
        info.localCalls.push({ name: callee, args: n.arguments.map((a) => literal(a)) });
      }
    });
  }

  return fns;
}

/**
 * Trigger types a function can reach: the ones it compares itself, plus those
 * it hands to a local helper's `triggerType` parameter, plus everything those
 * helpers reach in turn. This is what makes `purchase_event` visible —
 * `onOrderPlaced` passes it to `startTypedWorkflows`, whose body holds the
 * only `eq(workflows.triggerType, …)` for it.
 */
function reachableTypes(
  start: string,
  fns: Map<string, TriggerFn>,
  seen = new Set<string>(),
): Set<string> {
  const out = new Set<string>();
  if (seen.has(start)) return out;
  seen.add(start);

  const info = fns.get(start);
  if (!info) return out;
  for (const t of info.direct) out.add(t);

  for (const call of info.localCalls) {
    const callee = fns.get(call.name);
    if (!callee) continue;
    const idx = callee.params.indexOf('triggerType');
    const passed = idx >= 0 ? call.args[idx] : null;
    if (passed) out.add(passed);
    for (const t of reachableTypes(call.name, fns, seen)) out.add(t);
  }

  return out;
}

// ─── (3b) Production callers of triggers.ts exports ───────────────────────────

function productionCallers(exported: Set<string>): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const roots = [path.join(REPO, 'apps'), path.join(REPO, 'packages')].filter((p) =>
    fs.existsSync(p),
  );

  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      if (file === TRIGGERS_FILE || isTestFile(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      // Every real caller names the module, statically or in a dynamic
      // import(). The pre-filter keeps an unrelated local function that
      // happens to share a name from counting as a caller.
      if (!text.includes('workflows/triggers.js')) continue;

      const src = parse(file);
      walk(src, (n) => {
        if (!ts.isCallExpression(n)) return;
        const name = calleeName(n);
        if (!exported.has(name)) return;
        const line = src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        const list = found.get(name) ?? [];
        list.push(`${rel(file)}:${line}`);
        found.set(name, list);
      });
    }
  }

  return found;
}

// ─── Parsed views of the other three lists ────────────────────────────────────

/** `const triggerTypeValues = [...] as const` in routes/v1/workflows.ts. */
function apiTriggerValues(): string[] {
  const src = parse(ROUTE_FILE);
  let values: string[] = [];
  walk(src, (n) => {
    if (!ts.isVariableDeclaration(n) || n.name.getText() !== 'triggerTypeValues') return;
    const init = unwrap(n.initializer);
    if (init && ts.isArrayLiteralExpression(init)) {
      values = init.elements.map((e) => literal(e)).filter((v): v is string => !!v);
    }
  });
  return values;
}

/** `value:` of every tile in the new-workflow form's TRIGGER_TYPES. */
function uiTriggerValues(): string[] {
  const src = parse(UI_FILE);
  let values: string[] = [];
  walk(src, (n) => {
    if (!ts.isVariableDeclaration(n) || n.name.getText() !== 'TRIGGER_TYPES') return;
    const init = unwrap(n.initializer);
    if (!init || !ts.isArrayLiteralExpression(init)) return;
    values = init.elements.flatMap((el) => {
      if (!ts.isObjectLiteralExpression(el)) return [];
      const prop = el.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'value',
      );
      const v = prop && ts.isPropertyAssignment(prop) ? literal(prop.initializer) : null;
      return v ? [v] : [];
    });
  });
  return values;
}

/** Every literal compared against a `triggerType` column anywhere in the API. */
function allTriggerTypeLiterals(): Array<{ value: string; where: string }> {
  const out: Array<{ value: string; where: string }> = [];
  for (const file of sourceFiles(API_SRC)) {
    if (isTestFile(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('triggerType')) continue;
    const src = parse(file);
    walk(src, (n) => {
      if (!ts.isCallExpression(n)) return;
      for (const value of triggerTypeComparison(n)) {
        const lit = literal(value);
        if (!lit) continue;
        const line = src.getLineAndCharacterOfPosition(value.getStart()).line + 1;
        out.push({ value: lit, where: `${rel(file)}:${line}` });
      }
    });
  }
  return out;
}

// ─── Shared analysis ──────────────────────────────────────────────────────────

const graph = buildTriggerGraph();
const exportedNames = new Set([...graph].filter(([, v]) => v.exported).map(([k]) => k));
const callers = productionCallers(exportedNames);

/** trigger type -> ["onFormSubmit ← services/signup-forms/index.ts:341", …] */
const firedBy = new Map<string, string[]>();
for (const name of exportedNames) {
  const sites = callers.get(name) ?? [];
  if (sites.length === 0) continue;
  for (const type of reachableTypes(name, graph)) {
    const list = firedBy.get(type) ?? [];
    list.push(`${name} ← ${sites[0]}`);
    firedBy.set(type, list);
  }
}

const covers = (type: string): boolean => firedBy.has(type) || type in BY_ID_TRIGGERS;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('trigger coverage — scanner sanity', () => {
  // If the AST walk silently stopped working every assertion below would pass
  // or fail for the wrong reason. These say so first.
  it('parses triggers.ts into a non-trivial call graph', () => {
    expect(graph.size).toBeGreaterThan(15);
    expect(graph.has('onApiEvent')).toBe(true);
    expect(graph.has('startTypedWorkflows')).toBe(true);
  });

  it('finds production callers at all', () => {
    expect(callers.size).toBeGreaterThan(5);
    expect(callers.get('onApiEvent')?.length ?? 0).toBeGreaterThan(5);
  });

  it('follows a trigger type through a helper parameter, not just direct literals', () => {
    // purchase_event is only ever compared inside startTypedWorkflows, which
    // has no caller of its own; onOrderPlaced passes the literal in. A checker
    // that only read direct literals would miss this and, worse, would accept
    // a body that no longer passed anything.
    expect(graph.get('onOrderPlaced')?.direct.has('purchase_event')).toBe(false);
    expect(reachableTypes('onOrderPlaced', graph).has('purchase_event')).toBe(true);
  });

  it('sees through an `as` cast', () => {
    const src = ts.createSourceFile(
      'x.ts',
      "eq(workflows.triggerType, 'ghost' as never);",
      ts.ScriptTarget.Latest,
      true,
    );
    let seen: string | null = null;
    walk(src, (n) => {
      if (ts.isCallExpression(n)) {
        for (const v of triggerTypeComparison(n)) seen = literal(v);
      }
    });
    expect(seen).toBe('ghost');
  });

  it('reads the other three lists', () => {
    expect(apiTriggerValues().length).toBeGreaterThan(10);
    expect(uiTriggerValues().length).toBeGreaterThan(5);
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThan(50);
  });
});

describe('(1) every enum value is accepted by the API', () => {
  it.each([...ENUM_VALUES])('%s is in triggerTypeValues', (value) => {
    expect(
      apiTriggerValues().includes(value),
      `"${value}" is a workflow_trigger_type the database accepts, but ` +
        `triggerTypeValues in routes/v1/workflows.ts does not list it, so ` +
        `POST /api/v1/workflows answers 400 and no such workflow can exist — ` +
        `while whatever fires it keeps running. Add it there, or remove it ` +
        `from workflowTriggerTypeEnum.`,
    ).toBe(true);
  });
});

describe('(2) the API accepts nothing the enum lacks', () => {
  it('triggerTypeValues has no value outside workflowTriggerTypeEnum', () => {
    const strays = apiTriggerValues().filter((v) => !ENUM_VALUES.includes(v));
    expect(
      strays,
      `accepted by Zod but not a column value: ${strays.join(', ')}. ` +
        `The insert would fail at the database with a type error.`,
    ).toEqual([]);
  });
});

describe('(3) every enum value has an odpalovač with a production caller', () => {
  it.each([...ENUM_VALUES])('%s is actually fired', (value) => {
    const exception = BY_ID_TRIGGERS[value];
    if (exception) {
      expect(
        (callers.get(exception.via) ?? []).length,
        `"${value}" is exempt from type-matching because: ${exception.why} ` +
          `That exemption relies on ${exception.via}() having a production ` +
          `caller, and it now has none.`,
      ).toBeGreaterThan(0);
      return;
    }

    expect(
      firedBy.has(value),
      `Nothing fires "${value}". It can be selected, saved and activated, and ` +
        `the workflow will never run — no error, nothing in a log. Either add ` +
        `a function in services/workflows/triggers.ts that queries ` +
        `workflows.triggerType for it AND call that function from the place ` +
        `the event happens, or remove the value from workflowTriggerTypeEnum. ` +
        `Note both halves are required: an odpalovač with no caller is still ` +
        `a dead trigger.`,
    ).toBe(true);
  });
});

describe('(4) no trigger type literal outside the enum', () => {
  it('every triggerType comparison names a real enum value', () => {
    const strays = allTriggerTypeLiterals().filter((l) => !ENUM_VALUES.includes(l.value));
    expect(
      strays.map((s) => `${s.value} (${s.where})`),
      `These compare workflows.triggerType against a value the enum does not ` +
        `contain, so the query matches zero rows every time and the code around ` +
        `it is unreachable. Usually written with an \`as never\` cast to silence ` +
        `the compiler.`,
    ).toEqual([]);
  });
});

describe('(5) the UI offers every enum value', () => {
  it('offers nothing that is not in the enum', () => {
    const strays = uiTriggerValues().filter((v) => !ENUM_VALUES.includes(v));
    expect(strays, `offered by the UI but not a valid trigger: ${strays.join(', ')}`).toEqual([]);
  });

  it.each([...ENUM_VALUES])('%s has a tile in the new-workflow form', (value) => {
    if (value in ALLOWED_HIDDEN_IN_UI) return;
    expect(
      uiTriggerValues().includes(value),
      `"${value}" can be created through the API but the new-workflow form ` +
        `never offers it, so only an API caller can reach it. Add a tile to ` +
        `TRIGGER_TYPES, or record why it is hidden in ALLOWED_HIDDEN_IN_UI.`,
    ).toBe(true);
  });
});

describe('(6) no gallery template ships a trigger that never fires', () => {
  const templates = WORKFLOW_TEMPLATES.map((t) => [t.slug, t.trigger.type] as const);

  it.each(templates)('%s (trigger: %s) forks into a workflow that can run', (slug, type) => {
    expect(
      ENUM_VALUES.includes(type),
      `Template "${slug}" declares trigger type "${type}", which is not a ` +
        `workflow_trigger_type. Forking it would fail.`,
    ).toBe(true);

    expect(
      covers(type),
      `Template "${slug}" is built on "${type}", which nothing fires. A ` +
        `customer who forks it from the gallery gets a workflow that looks ` +
        `ready and never runs.`,
    ).toBe(true);
  });
});
