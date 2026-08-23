'use client';

/**
 * The folder strip above a list: one chip per drawer, plus the three things
 * you can do to a drawer.
 *
 * The chips are links, not buttons — the filter lives in the URL so a filtered
 * list can be bookmarked and shared, the same way the status filter next to it
 * already works. Only create, rename and delete need a client.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Folder {
  id: string;
  name: string;
  itemCount: number;
}

interface Props {
  kind: 'campaign' | 'template';
  folders: Folder[];
  /** The folder id in the URL, or 'none' for Unfiled, or undefined for All. */
  active?: string;
  /** Path the chips link to, e.g. "/campaigns". */
  basePath: string;
  /** Other query params to keep when switching folders, e.g. { tab: 'saved' }. */
  carry?: Record<string, string>;
}

export function FolderBar({ kind, folders, active, basePath, carry = {} }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | 'create' | 'rename'>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const activeFolder = folders.find((f) => f.id === active);

  function href(folderId?: string) {
    const params = new URLSearchParams(carry);
    if (folderId) params.set('folderId', folderId);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const chip = (label: string, isActive: boolean, to: string, count?: number) => (
    <Link
      key={to}
      href={to}
      className={
        'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
        (isActive
          ? 'bg-primary-600 text-white'
          : 'bg-white text-secondary-600 ring-1 ring-secondary-200 hover:bg-secondary-50')
      }
    >
      {label}
      {count !== undefined ? (
        <span className={isActive ? 'ml-1.5 text-primary-100' : 'ml-1.5 text-secondary-400'}>
          {count}
        </span>
      ) : null}
    </Link>
  );

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res =
        dialog === 'create'
          ? await fetch(`${API_BASE}/api/v1/folders`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind, name: trimmed }),
            })
          : await fetch(`${API_BASE}/api/v1/folders/${activeFolder!.id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: trimmed }),
            });

      if (res.status === 409) {
        toast('error', `A folder called "${trimmed}" already exists`);
        return;
      }
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', dialog === 'create' ? `Folder "${trimmed}" created` : 'Folder renamed');
      setDialog(null);
      setName('');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!activeFolder) return;
    const held = activeFolder.itemCount;
    const warning = held
      ? `Delete "${activeFolder.name}"? The ${held} item${held === 1 ? '' : 's'} inside will move to Unfiled — nothing is deleted.`
      : `Delete "${activeFolder.name}"?`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/folders/${activeFolder.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: { released: number } };
      toast(
        'success',
        body.data.released
          ? `Folder deleted, ${body.data.released} moved to Unfiled`
          : 'Folder deleted',
      );
      startTransition(() => router.push(href()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {chip('All folders', !active, href())}
      {chip('Unfiled', active === 'none', href('none'))}
      {folders.map((f) => chip(f.name, active === f.id, href(f.id), f.itemCount))}

      <span className="mx-1 h-4 w-px bg-secondary-200" aria-hidden="true" />

      <button
        onClick={() => {
          setName('');
          setDialog('create');
        }}
        disabled={busy || pending}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-secondary-600 hover:bg-secondary-100 disabled:opacity-50"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        New folder
      </button>

      {activeFolder ? (
        <>
          <button
            onClick={() => {
              setName(activeFolder.name);
              setDialog('rename');
            }}
            disabled={busy || pending}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-secondary-600 hover:bg-secondary-100 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            onClick={remove}
            disabled={busy || pending}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </>
      ) : null}

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'rename' ? 'Rename folder' : 'New folder'}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <Input
            label="Name"
            value={name}
            autoFocus
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Black Friday"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="rounded-md px-3 py-2 text-sm font-medium text-secondary-600 hover:bg-secondary-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : dialog === 'rename' ? 'Rename' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
