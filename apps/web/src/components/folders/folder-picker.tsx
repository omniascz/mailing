'use client';

/**
 * Move one item into a folder, or out of every folder.
 *
 * A plain select rather than drag and drop: it works with a keyboard, on a
 * phone, and in a list that is scrolled — and at two hundred campaigns
 * dragging one to a chip at the top of the page is the worse gesture.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  /** Collection route the item lives under, e.g. "/api/v1/campaigns". */
  endpoint: string;
  itemId: string;
  folders: { id: string; name: string }[];
  current: string | null;
  /** Rendered instead of a select when there are no folders yet. */
  emptyHint?: string;
}

export function FolderPicker({ endpoint, itemId, folders, current, emptyHint }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(current ?? '');

  if (folders.length === 0) {
    return emptyHint ? <span className="text-xs text-secondary-400">{emptyHint}</span> : null;
  }

  async function move(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}${endpoint}/${itemId}/folder`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: next === '' ? null : next }),
      });
      if (!res.ok) {
        setValue(previous);
        toast('error', `Could not move (${res.status})`);
        return;
      }
      toast('success', next === '' ? 'Moved to Unfiled' : 'Moved');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      aria-label="Folder"
      value={value}
      disabled={busy || pending}
      onChange={(e) => void move(e.target.value)}
      className="max-w-[10rem] truncate rounded-md border border-secondary-200 bg-white px-2 py-1 text-xs text-secondary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
    >
      <option value="">Unfiled</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
