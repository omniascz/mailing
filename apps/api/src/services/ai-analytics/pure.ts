/**
 * Aura Analytics pure helpers (#269-#272/L4-4).
 *
 * SQL safety heuristics + chart-type suggestion from result shape. The NL→SQL
 * service wraps these after Claude's tool-use returns a query.
 *
 * Production sandbox (sandbox.ts) delegates to the rich-result helpers below
 * (lexicalVerdict / structuralVerdict / injectOrgFilter) so we have one source
 * of truth and unit-test coverage for the security boundary.
 */

// ─── Shared verdict shape ─────────────────────────────────────────────────

export interface SafetyVerdict {
  safe: boolean;
  reason?: string;
}

// ─── Sandbox: schema-aware lexical + structural verdicts ───────────────────

export interface SandboxTableSchema {
  name: string;
  columns: Record<string, string>;
  orgColumn: string;
}

const SANDBOX_FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'DROP',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'COPY',
  'VACUUM',
  'ANALYZE',
  'CLUSTER',
  'REINDEX',
  'CALL',
  'EXECUTE',
  'DO',
  'LOCK',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'LISTEN',
  'NOTIFY',
  'PG_READ_FILE',
  'PG_LS_DIR',
  'PG_RELOAD_CONF',
  'LO_IMPORT',
  'LO_EXPORT',
  'DBLINK',
  'COPY_TO',
  'COPY_FROM',
] as const;

export const SANDBOX_FORBIDDEN_KEYWORDS_LIST = SANDBOX_FORBIDDEN_KEYWORDS;

function stripCommentsAndTrim(sqlText: string): string {
  return sqlText
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
}

/**
 * Defence-in-depth lexical guard: rejects DDL, DML, multi-statement, locking,
 * SELECT INTO, and any forbidden keyword. Production wraps this and turns the
 * verdict into an AppError.
 */
export function lexicalVerdict(sqlText: string): SafetyVerdict {
  const stripped = stripCommentsAndTrim(sqlText);
  if (!stripped) return { safe: false, reason: 'Empty query' };

  const withoutTrailing = stripped.replace(/;+\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { safe: false, reason: 'Multi-statement queries are not allowed' };
  }

  const upper = withoutTrailing.toUpperCase();
  if (!/^\s*(SELECT|WITH)\b/.test(upper)) {
    return { safe: false, reason: 'Only SELECT / WITH queries are allowed' };
  }

  for (const kw of SANDBOX_FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(withoutTrailing)) {
      return { safe: false, reason: `Forbidden keyword: ${kw}` };
    }
  }

  if (/\bSELECT\b[\s\S]+?\bINTO\b/i.test(withoutTrailing)) {
    return { safe: false, reason: 'SELECT INTO is not allowed' };
  }
  if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(withoutTrailing)) {
    return { safe: false, reason: 'Locking clauses are not allowed' };
  }
  // Comma-joins (FROM a, b) escape both the FROM/JOIN whitelist check and the
  // per-table org scoping — force explicit JOINs so every table is scoped.
  if (hasCommaJoin(withoutTrailing)) {
    return { safe: false, reason: 'Comma joins are not allowed — use explicit JOIN' };
  }
  return { safe: true };
}

/** True if any FROM clause uses a depth-0 comma join (FROM a, b). */
export function hasCommaJoin(query: string): boolean {
  const s = stripCommentsAndTrim(query);
  const re = /\bfrom\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    let depth = 0;
    for (let i = m.index + 4; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0) {
        if (ch === ',') return true;
        const rest = s.slice(i);
        if (
          /^\s+(where|group|order|having|limit|offset|union|except|intersect|window|join|left|right|inner|outer|full|cross|on)\b/i.test(
            rest,
          )
        ) {
          break;
        }
      }
    }
  }
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPE_ALIAS_KEYWORDS =
  'where|join|left|right|inner|outer|full|cross|on|group|order|by|limit|offset|having|union|except|intersect|window|fetch|for|using|natural|lateral|as';

/**
 * Rewrite a query so every whitelisted base table is replaced by an org-scoped
 * inline view: `FROM contacts` → `FROM (SELECT * FROM contacts WHERE org_id =
 * '<org>') AS contacts`. This enforces org isolation at the SQL level for ANY
 * projection or aggregate (count(*), bare columns, etc.) — unlike an outer
 * WHERE wrapper, which silently leaks when the query doesn't project org_id.
 * The orgId must be a UUID (validated) and is single-quote-escaped.
 */
export function scopeTablesToOrg(
  query: string,
  orgId: string,
  schemas: Record<string, SandboxTableSchema>,
): string {
  if (!UUID_RE.test(orgId)) throw new Error('Invalid orgId for sandbox scoping');
  const safeOrg = orgId.replace(/'/g, "''");
  const re = new RegExp(
    `\\b(from|join)\\s+([a-z_][a-z0-9_]*)(?:\\s+(?:as\\s+)?(?!(?:${SCOPE_ALIAS_KEYWORDS})\\b)([a-z_][a-z0-9_]*))?`,
    'gi',
  );
  return query.replace(re, (full: string, kw: string, table: string, alias?: string) => {
    const t = table.toLowerCase();
    const schema = schemas[t];
    if (!schema) return full; // CTE name / unknown — leave (structural check gates whitelist)
    const useAlias = alias ? alias : t;
    return `${kw} (SELECT * FROM ${t} WHERE ${schema.orgColumn} = '${safeOrg}') AS ${useAlias}`;
  });
}

/** Strip comments then collect FROM/JOIN targets and qualified table.column references. */
export function extractSqlIdentifiers(query: string): { tables: string[]; columns: string[] } {
  const stripped = query.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const tableRe = /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi;
  const tables: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(stripped)) !== null) tables.push(m[1]!.toLowerCase());

  const qualifiedRe = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;
  const qualified: string[] = [];
  while ((m = qualifiedRe.exec(stripped)) !== null) {
    qualified.push(`${m[1]!.toLowerCase()}.${m[2]!.toLowerCase()}`);
  }
  return { tables: [...new Set(tables)], columns: qualified };
}

export interface StructuralVerdict {
  safe: boolean;
  reason?: string;
  tables: string[];
}

/** Structural guard: every FROM/JOIN target must be in the schema; qualified columns must exist. */
export function structuralVerdict(
  query: string,
  schemas: Record<string, SandboxTableSchema>,
): StructuralVerdict {
  const { tables, columns } = extractSqlIdentifiers(query);
  if (tables.length === 0) {
    return { safe: false, reason: 'Query must reference at least one table', tables };
  }
  for (const t of tables) {
    if (!schemas[t]) return { safe: false, reason: `Table not in whitelist: ${t}`, tables };
  }
  for (const qc of columns) {
    const [tName, cName] = qc.split('.') as [string, string];
    const schema = schemas[tName];
    if (!schema) continue; // alias — can't resolve without a parser
    if (!schema.columns[cName]) {
      return { safe: false, reason: `Column not allowed: ${tName}.${cName}`, tables };
    }
  }
  return { safe: true, tables };
}

/** Render the schema as prompt context for the NL planner. */
export function describeSchemaForPrompt(
  schemas: Record<string, SandboxTableSchema>,
  descriptions: Record<string, string> = {},
): string {
  return Object.values(schemas)
    .map((t) => {
      const header = descriptions[t.name]
        ? `TABLE ${t.name} -- ${descriptions[t.name]}`
        : `TABLE ${t.name}`;
      const cols = Object.entries(t.columns)
        .map(([c, type]) => `  ${c} ${type}`)
        .join(',\n');
      return `${header}\n${cols}`;
    })
    .join('\n\n');
}

/**
 * Wrap a query in a CTE that hard-filters by the given orgId. The orgId is
 * single-quote-escaped so a malicious value can't break out of the literal.
 */
export function injectOrgFilter(
  query: string,
  primaryTable: string,
  orgId: string,
  schemas: Record<string, SandboxTableSchema>,
): string {
  const schema = schemas[primaryTable];
  if (!schema) throw new Error(`Unknown primary table: ${primaryTable}`);
  const orgCol = schema.orgColumn;
  const trimmed = query.trim().replace(/;+\s*$/, '');
  return `WITH __user_q AS (${trimmed})
SELECT * FROM __user_q WHERE ${orgCol} = '${orgId.replace(/'/g, "''")}'`;
}

// ─── Lightweight allowlist guard (used by saved-queries / NL planner) ───────

const DENY_PATTERNS: readonly RegExp[] = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bcreate\b/i,
  /\bcopy\b/i,
  /\bpg_sleep\b/i,
  /;.*\S/, // multi-statement
];

/**
 * Reject any SQL that's not a plain SELECT against whitelisted tables. The
 * NL→SQL layer prompts Claude to only emit SELECT, but we double-check at
 * runtime.
 */
export function isSafeReadOnlySql(sql: string, allowedTables: readonly string[]): SafetyVerdict {
  const trimmed = sql.trim().replace(/\s+/g, ' ');
  if (!/^\s*(?:with\b|select\b)/i.test(trimmed)) {
    return { safe: false, reason: 'SQL must start with SELECT or WITH' };
  }
  for (const re of DENY_PATTERNS) {
    if (re.test(trimmed)) {
      return { safe: false, reason: `Disallowed pattern: ${re.source}` };
    }
  }
  // Check every FROM/JOIN target is in the allowlist
  const referenced = extractReferencedTables(trimmed);
  const allow = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const name of referenced) {
    if (!allow.has(name.toLowerCase())) {
      return { safe: false, reason: `Table not allowlisted: ${name}` };
    }
  }
  return { safe: true };
}

/**
 * Extract identifiers that follow FROM or JOIN. Handles `schema.table`,
 * aliases (`table t`), and CTE references.
 */
export function extractReferencedTables(sql: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const ident = m[1]!;
    const bare = ident.includes('.') ? ident.split('.').pop()! : ident;
    out.add(bare);
  }
  return [...out];
}

// ─── Chart type suggestion ────────────────────────────────────────────────

export type ChartType = 'table' | 'bar' | 'line' | 'pie' | 'kpi' | 'area';

export interface ResultColumn {
  name: string;
  kind: 'string' | 'number' | 'date' | 'boolean';
}

/**
 * Pick a sensible default chart from the result columns + row count.
 *   - 1 numeric column + 0 other = KPI
 *   - 1 string + 1 numeric = bar (or pie when ≤6 slices)
 *   - 1 date + ≥1 numeric = line
 *   - otherwise table
 */
export function suggestChartType(columns: ResultColumn[], rowCount: number): ChartType {
  const nums = columns.filter((c) => c.kind === 'number').length;
  const strs = columns.filter((c) => c.kind === 'string').length;
  const dates = columns.filter((c) => c.kind === 'date').length;

  if (columns.length === 1 && nums === 1 && rowCount === 1) return 'kpi';
  if (dates >= 1 && nums >= 1) return 'line';
  if (strs === 1 && nums === 1) {
    return rowCount > 0 && rowCount <= 6 ? 'pie' : 'bar';
  }
  if (nums >= 2 && strs === 1) return 'bar';
  return 'table';
}
