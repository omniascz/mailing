'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, ArrowRight, CheckCircle2, AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BATCH_SIZE = 500;

type ContactField = 'skip' | 'email' | 'phone' | 'firstName' | 'lastName' | 'source';

const FIELD_LABELS: Record<ContactField, string> = {
  skip: '— Skip column —',
  email: 'Email',
  phone: 'Phone',
  firstName: 'First name',
  lastName: 'Last name',
  source: 'Source',
};

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded
 * commas + double-quote escaping (""). Skips empty trailing lines.
 * Good enough for the headers most marketers ship — anything weirder
 * should be cleaned up in Excel before upload anyway.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      cell = '';
      // Skip lines that are entirely empty (a single empty cell)
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

/** Best-effort header → field guess so users rarely touch the mapper. */
function guessField(header: string): ContactField {
  const h = header.toLowerCase().trim();
  if (/^e?-?mail/i.test(h)) return 'email';
  if (/phone|mobile|tel|cell/i.test(h)) return 'phone';
  if (/first|given|jméno|jmeno/i.test(h)) return 'firstName';
  if (/last|surname|family|příjmení|prijmeni/i.test(h)) return 'lastName';
  if (/source|origin/i.test(h)) return 'source';
  return 'skip';
}

interface ImportResult {
  totalRows: number;
  imported: number;
  errors: Array<{ batchIndex: number; status: number; message: string }>;
}

export function CsvImporter({ lists }: { lists: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ContactField[]>([]);
  const [listId, setListId] = useState<string>('');

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFilename('');
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setListId('');
    setProgress(0);
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast('error', 'File larger than 50 MB — split it first');
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast('error', 'CSV has no data rows');
      return;
    }
    const [head, ...body] = parsed;
    setFilename(file.name);
    setHeaders(head!);
    setRows(body);
    setMapping(head!.map(guessField));
    setResult(null);
  }

  async function runImport() {
    const emailIdx = mapping.indexOf('email');
    const phoneIdx = mapping.indexOf('phone');
    if (emailIdx < 0 && phoneIdx < 0) {
      toast('error', 'Map at least one column to Email or Phone');
      return;
    }

    setImporting(true);
    setProgress(0);
    setResult(null);

    const contacts = rows
      .map((r) => {
        const obj: Record<string, string> = {};
        mapping.forEach((field, i) => {
          if (field === 'skip') return;
          const val = (r[i] ?? '').trim();
          if (val) obj[field] = val;
        });
        return obj;
      })
      .filter((c) => c.email || c.phone);

    const errors: ImportResult['errors'] = [];
    let imported = 0;

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`${API_BASE}/api/v1/contacts/batch`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: batch }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          errors.push({
            batchIndex: i / BATCH_SIZE,
            status: res.status,
            message: text.slice(0, 200),
          });
        } else {
          const body = (await res.json()) as { total?: number };
          imported += body.total ?? batch.length;

          // Optional: attach to list. Done sequentially per contact because
          // /lists/:id/contacts is per-contact. Best-effort — failures here
          // shouldn't bubble up as a hard import error since the contact
          // itself made it in.
          if (listId) {
            const created = body as unknown as { data?: Array<{ id: string }> };
            if (Array.isArray(created.data)) {
              await Promise.all(
                created.data.map((c) =>
                  fetch(`${API_BASE}/api/v1/lists/${listId}/contacts`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contactId: c.id }),
                  }).catch(() => {}),
                ),
              );
            }
          }
        }
      } catch (err) {
        errors.push({
          batchIndex: i / BATCH_SIZE,
          status: 0,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setProgress(Math.min(i + BATCH_SIZE, contacts.length));
    }

    setImporting(false);
    setResult({ totalRows: contacts.length, imported, errors });
    startTransition(() => router.refresh());
  }

  // ─── Stage 0: file pick ──────────────────────────────────────────────────────
  if (headers.length === 0) {
    return (
      <div>
        <label
          htmlFor="csv-file"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-secondary-300 bg-secondary-50 px-6 py-12 text-center transition-colors hover:bg-secondary-100"
        >
          <FileUp className="h-8 w-8 text-secondary-400" />
          <p className="text-sm font-medium text-secondary-900">Click to choose a CSV file</p>
          <p className="text-xs text-secondary-500">
            Expected columns: email, first name, last name, phone — order doesn't matter, we'll map
            them next.
          </p>
        </label>
        <input
          id="csv-file"
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="hidden"
        />
      </div>
    );
  }

  // ─── Stage 2: result summary ─────────────────────────────────────────────────
  if (result) {
    const ok = result.errors.length === 0;
    return (
      <div className="space-y-4">
        <div
          className={
            'flex items-start gap-3 rounded-md border p-4 ' +
            (ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')
          }
        >
          {ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div>
            <p className="font-medium text-secondary-900">
              Imported {result.imported.toLocaleString('cs-CZ')} of{' '}
              {result.totalRows.toLocaleString('cs-CZ')} contacts
            </p>
            {!ok ? (
              <p className="mt-1 text-sm text-secondary-700">
                {result.errors.length} batch{result.errors.length === 1 ? '' : 'es'} failed — see
                below.
              </p>
            ) : null}
          </div>
        </div>

        {result.errors.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {result.errors.map((err, i) => (
              <li
                key={i}
                className="rounded-md border border-rose-200 bg-rose-50 p-2 font-mono text-rose-800"
              >
                Batch #{err.batchIndex + 1}: {err.status} — {err.message || 'unknown error'}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={reset} variant="outline">
            <RotateCw className="h-4 w-4" />
            Import another file
          </Button>
          <Button onClick={() => router.push('/contacts')} loading={pending}>
            View contacts
          </Button>
        </div>
      </div>
    );
  }

  // ─── Stage 1: mapping ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-secondary-200 bg-secondary-50 p-3 text-xs text-secondary-700">
        <p className="font-medium text-secondary-900">{filename}</p>
        <p className="mt-0.5">
          {rows.length.toLocaleString('cs-CZ')} data rows · {headers.length} columns
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Column mapping</label>
        <ul className="divide-y divide-secondary-100 rounded-md border border-secondary-200">
          {headers.map((h, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
              <code className="truncate font-mono text-xs text-secondary-700">
                {h || `Column ${i + 1}`}
              </code>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-secondary-400" />
              <select
                value={mapping[i] ?? 'skip'}
                onChange={(e) => {
                  const next = [...mapping];
                  next[i] = e.target.value as ContactField;
                  setMapping(next);
                }}
                className="h-8 rounded-md border border-secondary-300 px-2 text-xs focus:border-primary-500 focus:outline-none"
              >
                {Object.entries(FIELD_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      {lists.length > 0 ? (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-secondary-700">
            Add to list (optional)
          </label>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Don't attach to a list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Preview first 3 rows */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-secondary-700">Preview (first 3 rows)</p>
        <div className="overflow-x-auto rounded-md border border-secondary-200">
          <table className="w-full text-xs">
            <thead className="bg-secondary-50">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-medium text-secondary-600">
                    {h}
                    {mapping[i] && mapping[i] !== 'skip' ? (
                      <span className="ml-1 font-normal text-primary-600">
                        → {FIELD_LABELS[mapping[i]!]}
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100">
              {rows.slice(0, 3).map((r, i) => (
                <tr key={i}>
                  {headers.map((_, j) => (
                    <td key={j} className="px-2 py-1.5 text-secondary-700">
                      <span className={mapping[j] === 'skip' ? 'text-secondary-300' : ''}>
                        {r[j] ?? ''}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {importing ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-secondary-600">
            <span>
              Importing… {progress.toLocaleString('cs-CZ')} / {rows.length.toLocaleString('cs-CZ')}
            </span>
            <span className="tabular-nums">
              {Math.round((progress / Math.max(1, rows.length)) * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary-100">
            <div
              className="h-full rounded-full bg-primary-500 transition-all"
              style={{ width: `${(progress / Math.max(1, rows.length)) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={reset} disabled={importing}>
          Cancel
        </Button>
        <Button onClick={runImport} loading={importing}>
          Import {rows.length.toLocaleString('cs-CZ')} rows
        </Button>
      </div>
    </div>
  );
}
