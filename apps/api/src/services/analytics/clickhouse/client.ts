/**
 * Minimal ClickHouse HTTP client — no SDK dependency, just fetch.
 * ClickHouse exposes a plain HTTP interface (default :8123): SQL goes in the
 * request body, results come back as JSONEachRow (newline-delimited JSON).
 *
 * Gated behind CLICKHOUSE_ENABLED=true so deployments without a ClickHouse
 * cluster are completely unaffected (every analytics read falls back to Postgres).
 */

export interface ClickHouseConfig {
  url: string;
  database: string;
  user?: string;
  password?: string;
}

export function isClickHouseEnabled(): boolean {
  return process.env.CLICKHOUSE_ENABLED === 'true';
}

export function clickHouseConfig(): ClickHouseConfig {
  return {
    url: (process.env.CLICKHOUSE_URL ?? 'http://localhost:8123').replace(/\/$/, ''),
    database: process.env.CLICKHOUSE_DATABASE ?? 'forgemsg',
    user: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
  };
}

function authHeaders(cfg: ClickHouseConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.user) h['X-ClickHouse-User'] = cfg.user;
  if (cfg.password) h['X-ClickHouse-Key'] = cfg.password;
  return h;
}

/** Parse a JSONEachRow response body into typed rows. Pure + unit-tested. */
export function parseJSONEachRow<T>(text: string): T[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

/** Serialize rows to a JSONEachRow request body. Pure + unit-tested. */
export function toJSONEachRow(rows: Array<Record<string, unknown>>): string {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}

/** Execute a statement with no row output (DDL, INSERT ... VALUES, etc.). */
export async function chExec(sql: string, cfg = clickHouseConfig()): Promise<void> {
  const res = await fetch(`${cfg.url}/?database=${encodeURIComponent(cfg.database)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...authHeaders(cfg) },
    body: sql,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(
      `ClickHouse exec ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`,
    );
  }
}

/** Run a SELECT and return typed rows (FORMAT JSONEachRow is appended). */
export async function chQuery<T>(sql: string, cfg = clickHouseConfig()): Promise<T[]> {
  const body = `${sql}\nFORMAT JSONEachRow`;
  const res = await fetch(`${cfg.url}/?database=${encodeURIComponent(cfg.database)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...authHeaders(cfg) },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(
      `ClickHouse query ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`,
    );
  }
  return parseJSONEachRow<T>(await res.text());
}

/** Bulk-insert rows into a table using JSONEachRow. */
export async function chInsert(
  table: string,
  rows: Array<Record<string, unknown>>,
  cfg = clickHouseConfig(),
): Promise<number> {
  if (rows.length === 0) return 0;
  const query = `INSERT INTO ${table} FORMAT JSONEachRow`;
  const url = `${cfg.url}/?database=${encodeURIComponent(cfg.database)}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson', ...authHeaders(cfg) },
    body: toJSONEachRow(rows),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(
      `ClickHouse insert ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`,
    );
  }
  return rows.length;
}

/** Escape a string literal for inline ClickHouse SQL (we only inline UUIDs/enums). */
export function chEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
