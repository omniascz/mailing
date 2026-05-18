import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

export type ImportFormat = 'csv' | 'xlsx';

export interface ParsedFile {
  columns: string[];
  rows: Record<string, string>[];
}

/**
 * Parse a CSV file into headers + rows.
 * All values are coerced to strings; empty cells become ''.
 */
export async function parseCsv(path: string): Promise<ParsedFile> {
  const content = await readFile(path, 'utf8');
  return parseCsvString(content);
}

export function parseCsvString(content: string): ParsedFile {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
    transformHeader: (h) => h.trim(),
  });
  const columns = (result.meta.fields ?? []).filter((c) => c && c.length > 0);
  const rows = (result.data ?? []).filter((r) => r && typeof r === 'object');
  return { columns, rows };
}

export async function parseXlsx(path: string): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.worksheets[0];
  if (!sheet) return { columns: [], rows: [] };

  const columns: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const v = cell.value == null ? '' : String(cell.value).trim();
    if (v) columns.push(v);
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;
    const obj: Record<string, string> = {};
    columns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);
      const v = cell.value;
      obj[col] = v == null ? '' : typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text) : String(v);
    });
    rows.push(obj);
  }

  return { columns, rows };
}

export async function parseFile(path: string, format: ImportFormat): Promise<ParsedFile> {
  if (format === 'csv') return parseCsv(path);
  return parseXlsx(path);
}

export function detectFormat(filename: string): ImportFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  return null;
}
