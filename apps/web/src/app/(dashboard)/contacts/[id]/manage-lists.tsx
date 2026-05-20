'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ListOption {
  id: string;
  name: string;
}

interface ContactList {
  id: string;
  name: string;
}

/**
 * Inline list-membership manager for a single contact. Uses the existing
 * /lists/:id/contacts POST + DELETE endpoints — the same admin-add path
 * that skips DOI confirmation (so admins can put someone on a list
 * without needing them to click a confirmation email).
 */
export function ManageLists({
  contactId,
  currentLists,
  availableLists,
}: {
  contactId: string;
  currentLists: ContactList[];
  availableLists: ListOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const currentIds = new Set(currentLists.map((l) => l.id));
  const addable = availableLists.filter((l) => !currentIds.has(l.id));

  async function add(listId: string) {
    setBusy(listId);
    try {
      const res = await fetch(`${API_BASE}/api/v1/lists/${listId}/contacts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Add failed (${res.status})`);
        return;
      }
      toast('success', 'Added to list');
      setOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function remove(listId: string) {
    setBusy(listId);
    try {
      const res = await fetch(`${API_BASE}/api/v1/lists/${listId}/contacts/${contactId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Remove failed (${res.status})`);
        return;
      }
      toast('success', 'Removed from list');
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentLists.length === 0 ? (
        <span className="text-secondary-400">—</span>
      ) : (
        currentLists.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 py-0.5 pl-2 pr-1 text-xs font-medium text-primary-700"
          >
            {l.name}
            <button
              onClick={() => remove(l.id)}
              disabled={busy === l.id || pending}
              aria-label={`Remove from ${l.name}`}
              className="ml-0.5 rounded-full p-0.5 text-primary-400 hover:bg-primary-100 hover:text-primary-700 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))
      )}

      {addable.length > 0 ? (
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-secondary-300 px-2 py-0.5 text-xs font-medium text-secondary-500 hover:border-secondary-400 hover:text-secondary-700"
          >
            <Plus className="h-3 w-3" />
            List
          </button>
          {open ? (
            <div className="absolute left-0 top-full z-10 mt-1 w-48 max-h-48 overflow-y-auto rounded-md border border-secondary-200 bg-white p-1 shadow-lg">
              {addable.map((l) => (
                <button
                  key={l.id}
                  onClick={() => add(l.id)}
                  disabled={busy === l.id || pending}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-secondary-800 hover:bg-secondary-50 disabled:opacity-50"
                >
                  {l.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
