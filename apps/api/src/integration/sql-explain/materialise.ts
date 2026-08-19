/**
 * Layer 1, step two: turn a collected template into SQL text the planner will
 * accept, by deciding what to write into each `${}` hole.
 *
 * ─── The four kinds of hole ─────────────────────────────────────────────────
 *
 * Confusing these is what makes a naive substitution produce noise instead of
 * findings, so each is decided from the AST text rather than guessed:
 *
 *  1. DRIZZLE REFERENCE — `${emailEvents}`, `${emailEvents.createdAt}`.
 *     Not values at all: drizzle writes them into the query as identifiers. We
 *     resolve them for real against the same schema module the application
 *     imports, so `${emailEvents.createdAt}` becomes
 *     `"email_events"."created_at"`. Resolving instead of stubbing is what lets
 *     statements assembled by the query builder be planned at all — the sonda's
 *     one-shot version could not read these and skipped every such query.
 *
 *  2. PLAIN VALUE — `${orgId}`, `${limit}`, `${since.toISOString()}`,
 *     `${sql.param(xs)}`. Becomes a literal. `NULL` is tried first because a
 *     neighbouring `::uuid` / `::timestamptz` cast types it, which covers most
 *     of the codebase; other literals follow for the places NULL is not legal
 *     (`INTERVAL NULL`, `= ANY(NULL)`).
 *
 *  3. NESTED FRAGMENT — `${whereClause}`, `${before('created_at')}`,
 *     `${cond ? sql`…` : sql``}`. Its value is more SQL, composed at runtime.
 *     There is no honest static value. Replaced with `TRUE` where it sits in a
 *     boolean position and with nothing where it is a trailing clause — which
 *     of the two is right is not knowable from the text, so both are tried.
 *     NOTE the consequence: a column named ONLY inside such a fragment is
 *     invisible to this layer. That gap is exactly what layer 2 exists for.
 *
 *  4. DYNAMIC IDENTIFIER — `${sql.raw(col)}`, `${sql.identifier(t)}`, and the
 *     postgres.js bulk helper `${sql(rows)}` which expands to a column list
 *     taken from object keys. The text injected is chosen at runtime. Any value
 *     we invent is a fiction, and a wrong one would be indistinguishable from a
 *     genuine missing-column finding — so these make the statement
 *     UNANALYSABLE by design rather than being guessed at.
 *
 * ─── Why several profiles rather than one ───────────────────────────────────
 *
 * One substitution leaves statements failing on syntax that has nothing to do
 * with the schema, and a check that reports those as findings is noise. So we
 * retry with different literals until the statement reaches the planner.
 *
 * The asymmetry that makes this sound: a placeholder can stop a statement
 * parsing, but it can never invent a column name. So `42703 undefined_column`
 * under ANY profile is a real finding and we stop there; only "no profile ever
 * parsed" downgrades a statement to unanalysable.
 */
import { is, Column, Table, getTableName } from 'drizzle-orm';
import * as schema from '../../db/schema/index.js';
import type { Template } from './collect.js';

/**
 * Literals tried in a value hole. The list is ordered by how much of the
 * codebase each one unblocks, and every entry earns its place by a shape the
 * schema actually uses:
 *
 *   NULL          typed by a neighbouring ::uuid / ::timestamptz cast
 *   uuid-shaped   org_id / contact_id comparisons, which are everywhere;
 *                 without it those fail `operator does not exist: uuid = …`
 *   '1' / 1       counts, limits, varchar and integer columns
 *   ISO timestamp window bounds compared against timestamptz
 *   'month'       date_trunc's field argument, which rejects anything else
 *   '{}'          array/jsonb positions, including `= ANY(…)`
 */
const VALUE_LITERALS = [
  'NULL',
  "'00000000-0000-0000-0000-000000000000'",
  "'1'",
  '1',
  "'2020-01-01T00:00:00Z'",
  "'month'",
  "'{}'",
] as const;

/**
 * A fragment sits either in a boolean position (`WHERE ${clause}` — needs TRUE)
 * or as a trailing clause (`… ${maybeCursor}` — needs nothing). Which one is
 * not knowable from the text, so both are tried.
 */
const FRAGMENT_REPLACEMENTS = ['TRUE', ''] as const;

/**
 * A bare `${whereSql}` and a bare `${orgId}` are the same shape in the AST — an
 * identifier — and only the variable's type says which is a value and which is
 * composed SQL. Rather than guess from the name (`dateFilter` and `daysFilter`
 * would guess differently for no good reason), such holes are marked ambiguous
 * and BOTH readings are tried.
 */
const AMBIGUOUS_MODES = ['as-value', 'as-fragment'] as const;

export interface Profile {
  value: string;
  fragment: string;
  ambiguous: (typeof AMBIGUOUS_MODES)[number];
}

const PROFILES: ReadonlyArray<Profile> = AMBIGUOUS_MODES.flatMap((ambiguous) =>
  FRAGMENT_REPLACEMENTS.flatMap((fragment) =>
    VALUE_LITERALS.map((value) => ({ value, fragment, ambiguous })),
  ),
);

export const PROFILE_COUNT = PROFILES.length;

const schemaExports = schema as unknown as Record<string, unknown>;

function quote(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/**
 * Resolve `emailEvents` / `emailEvents.createdAt` to the identifier drizzle
 * would emit. Returns null when the name is not a schema export.
 */
export function resolveDrizzleRef(text: string): string | null {
  const m = /^([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?$/.exec(text.trim());
  if (!m) return null;
  const [, objectName, propName] = m;
  const obj = schemaExports[objectName!];
  if (obj === undefined) return null;

  if (!propName) return is(obj, Table) ? quote(getTableName(obj)) : null;
  if (is(obj, Table)) {
    const col = (obj as unknown as Record<string, unknown>)[propName];
    if (col !== undefined && is(col, Column)) {
      return `${quote(getTableName(obj))}.${quote((col as Column).name)}`;
    }
  }
  return null;
}

/**
 * Injects SQL text chosen at runtime: drizzle's escape hatches, and the
 * postgres.js helper `sql(rows)` / `sql(obj, 'a', 'b')`, whose column list
 * comes from object keys that do not exist until the call runs.
 */
export function looksLikeDynamicIdentifier(text: string): boolean {
  const t = text.trim();
  if (/\bsql\.(raw|identifier)\s*\(/.test(t)) return true;
  // `sql(` but not `sql\`` and not `sql.param(` — the bulk/insert helper.
  if (/^sql\s*\(/.test(t)) return true;
  return false;
}

/**
 * A hole holds a plain value only when it looks like one: an identifier or
 * property access, a literal, or a call from the small set that returns a
 * scalar. Everything else — an arbitrary call, a conditional, a template
 * literal — can return composed SQL, so it is treated as a fragment. Erring
 * toward "fragment" is the safe direction: a fragment substituted as a value
 * produces a syntax error and lands in the unanalysable bucket, whereas a
 * value substituted as a fragment can silently drop a predicate.
 */
/** Definitely a scalar: a literal, or a call from a known scalar-returning set. */
function looksLikePlainValue(text: string): boolean {
  const t = text.trim();
  if (/^sql\.param\s*\(/.test(t)) return true;
  if (/^-?\d+(\.\d+)?$/.test(t)) return true; // numeric literal
  if (/^(['"`]).*\1$/.test(t) && !t.includes('${')) return true; // simple string literal
  if (
    /^[\w$.?![\]]+\.(toISOString|toString|toFixed|toUpperCase|toLowerCase|trim|getTime|valueOf)\s*\(\s*\)$/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(String|Number|Boolean|JSON\.stringify)\s*\(/.test(t)) return true;
  return false;
}

/** A bare name — could hold a value or a composed sql`` fragment. */
function looksAmbiguous(text: string): boolean {
  return /^[A-Za-z_$][\w$]*(\??\.[A-Za-z_$][\w$]*)*!?$/.test(text.trim());
}

export type HoleKind = 'ref' | 'value' | 'ambiguous' | 'fragment' | 'dynamic-identifier';

export function classifyHole(text: string): HoleKind {
  if (looksLikeDynamicIdentifier(text)) return 'dynamic-identifier';
  if (resolveDrizzleRef(text) !== null) return 'ref';
  if (looksLikePlainValue(text)) return 'value';
  if (looksAmbiguous(text)) return 'ambiguous';
  // Arbitrary call, conditional, template literal — can return composed SQL.
  return 'fragment';
}

export interface Materialised {
  sql: string;
  hasDynamicIdentifier: boolean;
  dynamicHoles: string[];
}

function buildWith(tpl: Template, pick: (kind: HoleKind, index: number) => string): Materialised {
  let out = tpl.chunks[0] ?? '';
  const dynamicHoles: string[] = [];

  tpl.holes.forEach((hole, i) => {
    const kind = classifyHole(hole.text);
    if (kind === 'dynamic-identifier') dynamicHoles.push(hole.text);
    const replacement =
      kind === 'dynamic-identifier'
        ? ' /*dynamic*/ '
        : kind === 'ref'
          ? resolveDrizzleRef(hole.text)!
          : pick(kind, i);
    out += replacement + (tpl.chunks[i + 1] ?? '');
  });

  return { sql: out.trim(), hasDynamicIdentifier: dynamicHoles.length > 0, dynamicHoles };
}

export function materialise(tpl: Template, profileIndex: number): Materialised {
  const profile = PROFILES[profileIndex % PROFILES.length]!;
  return buildWith(tpl, (kind) => {
    if (kind === 'value') return profile.value;
    if (kind === 'ambiguous') {
      return profile.ambiguous === 'as-value' ? profile.value : profile.fragment;
    }
    return profile.fragment;
  });
}

/**
 * The systematic profiles above choose ONE replacement for every hole of a
 * given kind at once. That is not enough for a statement whose holes need
 * different things — `INTERVAL ${unit}` next to `LIMIT ${n}`, or a comma list
 * where one entry is a fragment and the next a value. Rather than search all
 * combinations (exponential in the number of holes), try a bounded number of
 * per-hole draws.
 *
 * The PRNG is seeded so the unanalysable count is reproducible: an exclusion
 * ceiling that drifted between runs would be worthless as a guard.
 */
const ALL_REPLACEMENTS = [...VALUE_LITERALS, ...FRAGMENT_REPLACEMENTS];

export function materialiseRandom(tpl: Template, seed: number): Materialised {
  let state = (seed * 2654435761) >>> 0;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  return buildWith(tpl, () => ALL_REPLACEMENTS[next() % ALL_REPLACEMENTS.length]!);
}

export const RANDOM_ATTEMPTS = 80;

export function isCompleteStatement(text: string): boolean {
  return /^\s*(select|with|insert|update|delete)\b/i.test(text);
}

/**
 * `42P01` covers two very different situations, and only one is a finding.
 *
 *   relation "meetings" does not exist        → the table is not there. FINDING.
 *   missing FROM-clause entry for table "c"   → the name resolves in the parent
 *                                               query this fragment is spliced
 *                                               into. Correlated subquery, not
 *                                               a standalone statement.
 *
 * The second shape starts with SELECT, so it reaches the planner looking like a
 * whole statement; without this distinction it would be reported as a missing
 * table forever.
 */
export function isCorrelatedFragment(code: string, message: string): boolean {
  return code === '42P01' && /missing FROM-clause entry/i.test(message);
}
