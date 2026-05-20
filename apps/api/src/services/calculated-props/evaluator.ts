/**
 * Calculated properties evaluator (#350).
 *
 * Deterministic, side-effect-free evaluator over the AST defined in
 * `db/schema/calculated-properties.ts`. Safe to run on the hot path.
 *
 * Usage:
 *   const value = evaluate(prop.formula, {
 *     entity,               // the contact/deal/account row as a flat object
 *     resolvedProps: { ... } // previously computed $ref values on this entity
 *   });
 *
 * The evaluator is intentionally tiny — it supports arithmetic, comparisons,
 * a handful of functions (`now`, `days_between`, `coalesce`, `if`, ...), and
 * nothing else. No string interpolation, no user-defined functions, no
 * network, no JS semantics outside of these.
 */

import type {
  CalcNode,
  CalcBinOp,
  CalcCall,
  CalcLiteral,
} from '../../db/schema/calculated-properties.js';

export interface EvalContext {
  /** Root entity (contact/deal/account) — flat object with custom_fields merged in. */
  entity: Record<string, unknown>;
  /** Values of other calculated properties on the same entity, by `key`. */
  resolvedProps?: Record<string, unknown>;
  /** For deterministic testing. */
  now?: Date;
}

class EvalError extends Error {}

const MAX_DEPTH = 32;

export function evaluate(node: CalcNode, ctx: EvalContext, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new EvalError('Formula nesting too deep');

  if (node === null) return null;
  if (typeof node !== 'object') return node as CalcLiteral;

  if ('$field' in node) {
    return readField(ctx.entity, node.$field);
  }
  if ('$ref' in node) {
    const v = ctx.resolvedProps?.[node.$ref];
    return v ?? null;
  }
  if ('op' in node) return evalBinOp(node, ctx, depth);
  if ('fn' in node) return evalCall(node, ctx, depth);

  throw new EvalError('Unknown AST node');
}

function readField(entity: Record<string, unknown>, path: string): unknown {
  // Two conventions: top-level column (e.g. "email"), or "custom_fields.foo".
  if (path.includes('.')) {
    const [head, ...rest] = path.split('.');
    let cur: unknown = entity[head!];
    for (const p of rest) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur ?? null;
  }
  // Fallback: look in custom_fields if top-level missing.
  if (path in entity) return entity[path] ?? null;
  const cf = entity['custom_fields'];
  if (cf && typeof cf === 'object') {
    return (cf as Record<string, unknown>)[path] ?? null;
  }
  return null;
}

function evalBinOp(node: CalcBinOp, ctx: EvalContext, depth: number): unknown {
  const l = evaluate(node.left, ctx, depth + 1);
  const r = evaluate(node.right, ctx, depth + 1);

  switch (node.op) {
    case '+':
      return num(l) + num(r);
    case '-':
      return num(l) - num(r);
    case '*':
      return num(l) * num(r);
    case '/': {
      const d = num(r);
      return d === 0 ? null : num(l) / d;
    }
    case '%': {
      const d = num(r);
      return d === 0 ? null : num(l) % d;
    }
    case '==':
      return l === r;
    case '!=':
      return l !== r;
    case '<':
      return cmp(l, r) < 0;
    case '<=':
      return cmp(l, r) <= 0;
    case '>':
      return cmp(l, r) > 0;
    case '>=':
      return cmp(l, r) >= 0;
    case '&&':
      return Boolean(l) && Boolean(r);
    case '||':
      return Boolean(l) || Boolean(r);
    default:
      throw new EvalError(`Unknown binary op: ${(node as CalcBinOp).op}`);
  }
}

function evalCall(node: CalcCall, ctx: EvalContext, depth: number): unknown {
  const args = (node.args ?? []).map((a) => evaluate(a, ctx, depth + 1));
  const now = () => ctx.now ?? new Date();

  switch (node.fn) {
    case 'now':
      return now().toISOString();
    case 'today':
      return new Date(now().setHours(0, 0, 0, 0)).toISOString().slice(0, 10);

    case 'days_between':
      return msBetween(args) / 86_400_000;
    case 'hours_between':
      return msBetween(args) / 3_600_000;

    case 'coalesce':
      return args.find((v) => v !== null && v !== undefined) ?? null;
    case 'if':
      return args[0] ? (args[1] ?? null) : (args[2] ?? null);

    case 'lower':
      return typeof args[0] === 'string' ? args[0].toLowerCase() : null;
    case 'upper':
      return typeof args[0] === 'string' ? args[0].toUpperCase() : null;
    case 'length':
      return typeof args[0] === 'string'
        ? args[0].length
        : Array.isArray(args[0])
          ? args[0].length
          : 0;
    case 'concat':
      return args.map((a) => (a == null ? '' : String(a))).join('');

    case 'round':
      return Math.round(num(args[0]));
    case 'floor':
      return Math.floor(num(args[0]));
    case 'ceil':
      return Math.ceil(num(args[0]));
    case 'abs':
      return Math.abs(num(args[0]));
    case 'min':
      return Math.min(...args.map(num));
    case 'max':
      return Math.max(...args.map(num));
    default:
      throw new EvalError(`Unknown function: ${(node as CalcCall).fn}`);
  }
}

function msBetween(args: unknown[]): number {
  const a = toDate(args[0]);
  const b = toDate(args[1]);
  if (!a || !b) return 0;
  return a.getTime() - b.getTime();
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' || typeof b === 'number') {
    return num(a) - num(b);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const da = toDate(a);
  const db = toDate(b);
  if (da && db) return da.getTime() - db.getTime();
  return num(a) - num(b);
}

// ─── Referenced-field extraction (for eager cache invalidation) ──────────────

export function referencedFields(node: CalcNode, out: Set<string> = new Set()): Set<string> {
  if (node === null || typeof node !== 'object') return out;
  if ('$field' in node) {
    out.add(node.$field);
    return out;
  }
  if ('$ref' in node) return out;
  if ('op' in node) {
    referencedFields(node.left, out);
    referencedFields(node.right, out);
    return out;
  }
  if ('fn' in node) {
    for (const a of node.args ?? []) referencedFields(a, out);
    return out;
  }
  return out;
}
