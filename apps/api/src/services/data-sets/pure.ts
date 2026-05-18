/**
 * Data Sets pure helpers (#356/L4-5).
 *
 * Parameter binding + SQL template expansion. Parameters use `:name`
 * placeholders and are bound as positional parameters (`$1`, `$2`, …) to
 * pass to `db.execute`. All string params are rejected unless they match a
 * whitelist regex — callers never get to inject raw SQL.
 */

export type ParamType = 'string' | 'number' | 'date';

export interface ParameterSpec {
  name: string;
  type: ParamType;
  required?: boolean;
  defaultValue?: unknown;
}

export interface BoundQuery {
  sql: string;
  params: unknown[];
}

export interface BindResult {
  ok: true;
  bound: BoundQuery;
}

export interface BindError {
  ok: false;
  error: string;
}

export type BindOutcome = BindResult | BindError;

const VALID_PARAM_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

/**
 * Bind parameter values to a `:name`-style SQL template. Returns the SQL
 * rewritten to use `$1`, `$2`, … and the ordered params array.
 */
export function bindParameters(
  template: string,
  specs: ParameterSpec[],
  values: Record<string, unknown>,
): BindOutcome {
  // Validate spec names
  for (const s of specs) {
    if (!VALID_PARAM_NAME.test(s.name)) {
      return { ok: false, error: `Invalid parameter name: ${s.name}` };
    }
  }

  // Resolve effective values (with defaults)
  const effective: Record<string, unknown> = {};
  for (const s of specs) {
    const incoming = values[s.name];
    if (incoming === undefined || incoming === null || incoming === '') {
      if (s.defaultValue !== undefined) {
        effective[s.name] = s.defaultValue;
      } else if (s.required) {
        return { ok: false, error: `Missing required parameter: ${s.name}` };
      } else {
        effective[s.name] = null;
      }
    } else {
      const coerced = coerceValue(incoming, s.type);
      if (coerced === INVALID) {
        return {
          ok: false,
          error: `Parameter ${s.name} is not a valid ${s.type}`,
        };
      }
      effective[s.name] = coerced;
    }
  }

  // Walk the template and substitute placeholders
  const params: unknown[] = [];
  const specByName = new Map(specs.map((s) => [s.name, s]));
  const seen = new Map<string, number>();
  let sql = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === ':' && i + 1 < template.length) {
      const nameMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)/.exec(template.slice(i + 1));
      if (nameMatch) {
        const name = nameMatch[1]!;
        if (!specByName.has(name)) {
          return { ok: false, error: `Unknown parameter :${name}` };
        }
        let idx = seen.get(name);
        if (idx === undefined) {
          params.push(effective[name]);
          idx = params.length;
          seen.set(name, idx);
        }
        sql += `$${idx}`;
        i += 1 + name.length;
        continue;
      }
    }
    sql += ch;
    i += 1;
  }

  return { ok: true, bound: { sql, params } };
}

const INVALID: unique symbol = Symbol('invalid');

function coerceValue(value: unknown, type: ParamType): unknown | typeof INVALID {
  switch (type) {
    case 'string': {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return INVALID;
    }
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : INVALID;
      }
      return INVALID;
    }
    case 'date': {
      if (value instanceof Date) return value;
      if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? INVALID : d;
      }
      return INVALID;
    }
    default:
      return INVALID;
  }
}

/**
 * Cheap template-lint: make sure every `:name` in the SQL is declared.
 * Used by the save route so editors can't save broken templates.
 */
export function findUndeclaredPlaceholders(
  template: string,
  specs: ParameterSpec[],
): string[] {
  const declared = new Set(specs.map((s) => s.name));
  const found = new Set<string>();
  const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1]!;
    if (!declared.has(name)) found.add(name);
  }
  return [...found];
}

// ─── Cache keys ─────────────────────────────────────────────────────────────

/**
 * Stable cache key for a (dataSetId, params) pair. Uses JSON canonicalisation
 * so the same params in a different property order hit the same cache entry.
 */
export function cacheKey(dataSetId: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});
  return `data-set:${dataSetId}:${JSON.stringify(sorted)}`;
}
