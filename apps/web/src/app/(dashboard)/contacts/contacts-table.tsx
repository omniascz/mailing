'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Download, FolderPlus, Tag as TagIcon, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  unsubscribed: 'warning',
  bounced: 'danger',
  complained: 'danger',
  cleaned: 'default',
};

export interface ContactRow {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  lifecycleStage: string | null;
  totalSends: number | null;
  totalOpens: number | null;
  totalClicks: number | null;
  createdAt: string;
}

interface ListOption {
  id: string;
  name: string;
}

interface TagOption {
  id: string;
  name: string;
  color: string | null;
}

export function ContactsTable({
  contacts,
  lists = [],
  tags = [],
}: {
  contacts: ContactRow[];
  lists?: ListOption[];
  tags?: TagOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [addingListId, setAddingListId] = useState<string>('');
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [pickedTags, setPickedTags] = useState<Set<string>>(new Set());

  const allSelected = contacts.length > 0 && selected.size === contacts.length;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }

  /**
   * Run an async per-id operation in capped-concurrency chunks. The /lists
   * and /contacts endpoints are per-row, so the only ways to "bulk" are
   * sequential (slow) or parallel (risk rate-limit lockout). 8 is a
   * compromise that finishes 1k rows in ~30s on typical latency without
   * tripping per-IP throttles.
   */
  async function chunked(
    ids: string[],
    op: (id: string) => Promise<Response>,
  ): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    const CONCURRENCY = 8;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(op));
      for (const r of results) {
        if (r.status === 'fulfilled' && (r.value.ok || r.value.status === 204)) ok++;
        else failed++;
      }
    }
    return { ok, failed };
  }

  async function bulkTag(action: 'add' | 'remove') {
    if (selected.size === 0 || pickedTags.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/contacts/bulk-tag`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: Array.from(selected),
          tag_ids: Array.from(pickedTags),
          action,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast(
          'error',
          `${action === 'add' ? 'Tag' : 'Untag'} failed (${res.status}) ${text.slice(0, 120)}`,
        );
        return;
      }
      const body = (await res.json()) as { data: { affected: number } };
      toast(
        'success',
        `${action === 'add' ? 'Added' : 'Removed'} ${pickedTags.size} tag${pickedTags.size === 1 ? '' : 's'} ${action === 'add' ? 'to' : 'from'} ${selected.size} contact${selected.size === 1 ? '' : 's'} (${body.data.affected} associations)`,
      );
      setTagMenuOpen(false);
      setPickedTags(new Set());
      setSelected(new Set());
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  function togglePickedTag(tagId: string) {
    setPickedTags((s) => {
      const next = new Set(s);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function bulkAddToList(listId: string) {
    if (!listId || selected.size === 0) return;
    const list = lists.find((l) => l.id === listId);
    setBusy(true);
    setAddingListId(listId);
    const { ok, failed } = await chunked(Array.from(selected), (contactId) =>
      fetch(`${API_BASE}/api/v1/lists/${listId}/contacts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      }),
    );
    setBusy(false);
    setAddingListId('');
    setSelected(new Set());

    if (failed === 0) {
      toast('success', `Added ${ok} contact${ok === 1 ? '' : 's'} to ${list?.name ?? 'list'}`);
    } else {
      toast('error', `Added ${ok}, failed ${failed} (already on list?)`);
    }
    startTransition(() => router.refresh());
  }

  /**
   * Pure client-side CSV export of currently-visible rows (or the selected
   * subset when any rows are selected). The data is already in our React
   * state — saves a round-trip and keeps the export-data API path reserved
   * for GDPR Art. 20 portability requests, which need the full per-contact
   * event trail, not just the list-view columns.
   *
   * BOM prefix so Excel on Windows picks UTF-8 correctly.
   */
  function exportCsv() {
    const rows = contacts.filter((c) => selected.size === 0 || selected.has(c.id));
    const escape = (val: string | null | undefined) => {
      const s = val == null ? '' : String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'email',
      'phone',
      'first_name',
      'last_name',
      'status',
      'lifecycle_stage',
      'created_at',
    ];
    const lines = [
      header.join(','),
      ...rows.map((c) =>
        [c.email, c.phone, c.firstName, c.lastName, c.status, c.lifecycleStage, c.createdAt]
          .map(escape)
          .join(','),
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('success', `Exported ${rows.length} contact${rows.length === 1 ? '' : 's'}`);
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selected.size} contact${selected.size === 1 ? '' : 's'}? This soft-deletes — you can restore from the GDPR-export trail.`,
      )
    )
      return;

    setBusy(true);
    const { ok, failed } = await chunked(Array.from(selected), (id) =>
      fetch(`${API_BASE}/api/v1/contacts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      }),
    );
    setBusy(false);
    setSelected(new Set());

    if (failed === 0) {
      toast('success', `Deleted ${ok} contact${ok === 1 ? '' : 's'}`);
    } else {
      toast('error', `Deleted ${ok}, failed ${failed}`);
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-secondary-200 bg-white px-3 py-2">
        {selected.size > 0 ? (
          <>
            <p className="text-sm font-medium text-primary-900">{selected.size} selected</p>
            <div className="flex flex-wrap items-center gap-2">
              {lists.length > 0 ? (
                <div className="inline-flex items-center gap-1.5">
                  <FolderPlus className="h-3.5 w-3.5 text-secondary-400" />
                  <select
                    value={addingListId}
                    onChange={(e) => bulkAddToList(e.target.value)}
                    disabled={busy || pending}
                    className="h-8 rounded-md border border-secondary-300 bg-white px-2 text-xs focus:border-primary-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Add to list…</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {tags.length > 0 ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTagMenuOpen((v) => !v)}
                    disabled={busy || pending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50 disabled:opacity-50"
                  >
                    <TagIcon className="h-3.5 w-3.5" />
                    Tag{pickedTags.size > 0 ? ` (${pickedTags.size})` : '…'}
                  </button>
                  {tagMenuOpen ? (
                    <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-secondary-200 bg-white p-2 shadow-lg">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium text-secondary-500">Pick tags</p>
                        <button
                          onClick={() => setTagMenuOpen(false)}
                          aria-label="Close"
                          className="text-secondary-400 hover:text-secondary-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {tags.map((t) => (
                          <label
                            key={t.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary-50"
                          >
                            <input
                              type="checkbox"
                              checked={pickedTags.has(t.id)}
                              onChange={() => togglePickedTag(t.id)}
                              className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: t.color ?? '#64748b' }}
                              aria-hidden="true"
                            />
                            <span className="truncate text-secondary-800">{t.name}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-end gap-2 border-t border-secondary-100 pt-2">
                        <button
                          onClick={() => bulkTag('remove')}
                          disabled={busy || pending || pickedTags.size === 0}
                          className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-40"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => bulkTag('add')}
                          disabled={busy || pending || pickedTags.size === 0}
                          className="inline-flex items-center rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                onClick={exportCsv}
                disabled={busy || pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button
                onClick={bulkDelete}
                disabled={busy || pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {busy ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                disabled={busy || pending}
                className="text-sm font-medium text-secondary-600 hover:text-secondary-900 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-secondary-500">Select contacts for bulk actions.</p>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export visible
            </button>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
        <table className="w-full">
          <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 text-right font-medium">Sends</th>
              <th className="px-4 py-3 text-right font-medium">Opens</th>
              <th className="px-4 py-3 text-right font-medium">Clicks</th>
              <th className="px-4 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-100 text-sm">
            {contacts.map((c) => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
              const isSelected = selected.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={isSelected ? 'bg-primary-50/50' : 'hover:bg-secondary-50'}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(c.id)}
                      aria-label={`Select ${c.email ?? c.id}`}
                      className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-secondary-900 hover:text-primary-700"
                    >
                      {name || c.email || c.phone || '(no identifier)'}
                    </Link>
                    {name && (c.email || c.phone) ? (
                      <p className="mt-0.5 truncate text-xs text-secondary-500">
                        {c.email || c.phone}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_TONE[c.status] ?? 'default'}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-secondary-600">
                    {c.lifecycleStage ?? <span className="text-secondary-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-secondary-700">
                    {(c.totalSends ?? 0).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-secondary-700">
                    {(c.totalOpens ?? 0).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-secondary-700">
                    {(c.totalClicks ?? 0).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-secondary-500">
                    {new Date(c.createdAt).toLocaleDateString('cs-CZ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
