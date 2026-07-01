/**
 * Minimal RFC 4180 CSV serialisation (pure, dependency-free).
 *
 * Used by report/contact export endpoints. Fields containing a comma, quote,
 * or newline are wrapped in double quotes with internal quotes doubled.
 */

/** Escape a single CSV field per RFC 4180. */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  /** Header label. */
  header: string;
  /** Key or accessor for the row value. */
  value: keyof T | ((row: T) => unknown);
}

/**
 * Serialise an array of objects to a CSV string with a header row.
 * `columns` fixes column order and headers; omit to use the union of keys.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: CsvColumn<T>[],
): string {
  const cols: CsvColumn<T>[] =
    columns ??
    Array.from(
      rows.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    ).map((k) => ({ header: k, value: k as keyof T }));

  const headerLine = cols.map((c) => escapeCsvField(c.header)).join(',');
  const lines = rows.map((row) =>
    cols
      .map((c) => escapeCsvField(typeof c.value === 'function' ? c.value(row) : row[c.value]))
      .join(','),
  );
  return [headerLine, ...lines].join('\r\n');
}
