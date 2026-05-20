/**
 * Programmable data pipeline pure helpers (#357).
 *
 * Extracted from pipeline.ts so the predicate / filter / map / aggregate /
 * sort / limit logic gets unit-tested without crossing the schema barrel.
 *
 * The Step / Predicate types are duplicated here in stripped form so the
 * tests stay free of the Drizzle import. The barrel schema re-uses these
 * shapes through a structural-typing match in pipeline.ts.
 */

export type Row = Record<string, unknown>;

export type Predicate =
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown }
  | { field: string; op: 'contains' | 'not_contains'; value: string }
  | { field: string; op: 'is_null' | 'is_not_null' }
  | { and: Predicate[] }
  | { or: Predicate[] };

export interface FilterStep {
  type: 'filter';
  predicate: Predicate;
}
export interface MapStep {
  type: 'map';
  projection: Record<string, string | { $field: string }>;
}
export interface AggregateStep {
  type: 'aggregate';
  groupBy: string[];
  metrics: Record<string, { op: 'count' | 'sum' | 'avg' | 'min' | 'max'; field?: string }>;
}
export interface LimitStep {
  type: 'limit';
  count: number;
}
export interface SortStep {
  type: 'sort';
  by: Array<{ field: string; dir: 'asc' | 'desc' }>;
}
export interface JoinStep {
  type: 'join';
  rightSource: string;
  on: { left: string; right: string };
  kind: 'inner' | 'left';
  select?: string[];
}

// ─── Field access ────────────────────────────────────────────────────────────

export function getField(row: Row, path: string): unknown {
  if (!path.includes('.')) return row[path] ?? null;
  let cur: unknown = row;
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur ?? null;
}

export function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return 0;
}

// ─── Predicate ───────────────────────────────────────────────────────────────

export function evalPredicate(p: Predicate, row: Row): boolean {
  if ('and' in p) return p.and.every((sub) => evalPredicate(sub, row));
  if ('or' in p) return p.or.some((sub) => evalPredicate(sub, row));
  const v = getField(row, p.field);
  switch (p.op) {
    case 'eq':
      return v === p.value;
    case 'neq':
      return v !== p.value;
    case 'gt':
      return cmp(v, p.value) > 0;
    case 'gte':
      return cmp(v, p.value) >= 0;
    case 'lt':
      return cmp(v, p.value) < 0;
    case 'lte':
      return cmp(v, p.value) <= 0;
    case 'contains':
      return typeof v === 'string' && v.includes(p.value);
    case 'not_contains':
      return typeof v === 'string' && !v.includes(p.value);
    case 'is_null':
      return v === null || v === undefined;
    case 'is_not_null':
      return v !== null && v !== undefined;
  }
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export function applyFilter(step: FilterStep, rows: Row[]): Row[] {
  return rows.filter((r) => evalPredicate(step.predicate, r));
}

export function applyMap(step: MapStep, rows: Row[]): Row[] {
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(step.projection)) {
      out[k] = typeof v === 'string' ? getField(r, v) : getField(r, v.$field);
    }
    return out;
  });
}

export function applyAggregate(step: AggregateStep, rows: Row[]): Row[] {
  const buckets = new Map<string, { key: Row; rows: Row[] }>();
  for (const r of rows) {
    const key: Row = {};
    const parts: unknown[] = [];
    for (const g of step.groupBy) {
      const v = getField(r, g);
      key[g] = v;
      parts.push(v);
    }
    const k = JSON.stringify(parts);
    const b = buckets.get(k) ?? { key, rows: [] };
    b.rows.push(r);
    buckets.set(k, b);
  }

  const out: Row[] = [];
  for (const { key, rows: group } of buckets.values()) {
    const agg: Row = { ...key };
    for (const [name, m] of Object.entries(step.metrics)) {
      const values = m.field
        ? group.map((r) => getField(r, m.field!)).filter((v) => v !== null && v !== undefined)
        : [];
      switch (m.op) {
        case 'count':
          agg[name] = group.length;
          break;
        case 'sum':
          agg[name] = values.reduce<number>((acc, v) => acc + Number(v || 0), 0);
          break;
        case 'avg':
          agg[name] = values.length
            ? values.reduce<number>((acc, v) => acc + Number(v || 0), 0) / values.length
            : 0;
          break;
        case 'min':
          agg[name] = values.length ? Math.min(...values.map((v) => Number(v))) : null;
          break;
        case 'max':
          agg[name] = values.length ? Math.max(...values.map((v) => Number(v))) : null;
          break;
      }
    }
    out.push(agg);
  }
  return out;
}

export function applyLimit(step: LimitStep, rows: Row[]): Row[] {
  return rows.slice(0, Math.max(0, step.count));
}

export function applySort(step: SortStep, rows: Row[]): Row[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const { field, dir } of step.by) {
      const c = cmp(getField(a, field), getField(b, field));
      if (c !== 0) return dir === 'asc' ? c : -c;
    }
    return 0;
  });
  return copy;
}

/** Join helper — synchronous version that takes the right-hand rows already loaded. */
export function joinRows(step: JoinStep, leftRows: Row[], rightRows: Row[]): Row[] {
  const index = new Map<string, Row>();
  for (const r of rightRows) index.set(String(getField(r, step.on.right)), r);

  const out: Row[] = [];
  for (const l of leftRows) {
    const r = index.get(String(getField(l, step.on.left)));
    if (!r) {
      if (step.kind === 'left') out.push(l);
      continue;
    }
    const merged: Row = { ...l };
    const pickKeys = step.select ?? Object.keys(r);
    for (const k of pickKeys) merged[k] = r[k];
    out.push(merged);
  }
  return out;
}
