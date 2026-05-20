'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface TagOption {
  id: string;
  name: string;
  color: string | null;
}

interface ContactTag {
  id: string;
  name: string;
}

/**
 * Inline tag manager for a single contact. Uses the existing
 * /contacts/bulk-tag endpoint with contact_ids=[this.id] — saves a
 * dedicated per-contact endpoint while keeping the call shape identical
 * to the bulk path in ContactsTable.
 */
export function ManageTags({
  contactId,
  currentTags,
  availableTags,
}: {
  contactId: string;
  currentTags: ContactTag[];
  availableTags: TagOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const currentIds = new Set(currentTags.map((t) => t.id));
  const colorMap = new Map(availableTags.map((t) => [t.id, t.color]));
  const addable = availableTags.filter((t) => !currentIds.has(t.id));

  async function mutate(tagId: string, action: 'add' | 'remove') {
    setBusy(tagId);
    try {
      const res = await fetch(`${API_BASE}/api/v1/contacts/bulk-tag`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: [contactId],
          tag_ids: [tagId],
          action,
        }),
      });
      if (!res.ok) {
        toast('error', `${action === 'add' ? 'Tag' : 'Untag'} failed (${res.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentTags.length === 0 ? (
        <span className="text-secondary-400">—</span>
      ) : (
        currentTags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary-100 py-0.5 pl-2 pr-1 text-xs font-medium text-secondary-700"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: colorMap.get(t.id) ?? '#64748b' }}
              aria-hidden="true"
            />
            {t.name}
            <button
              onClick={() => mutate(t.id, 'remove')}
              disabled={busy === t.id || pending}
              aria-label={`Remove ${t.name}`}
              className="ml-0.5 rounded-full p-0.5 text-secondary-400 hover:bg-secondary-200 hover:text-secondary-700 disabled:opacity-50"
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
            Tag
          </button>
          {open ? (
            <div className="absolute left-0 top-full z-10 mt-1 w-48 max-h-48 overflow-y-auto rounded-md border border-secondary-200 bg-white p-1 shadow-lg">
              {addable.map((t) => (
                <button
                  key={t.id}
                  onClick={() => mutate(t.id, 'add')}
                  disabled={busy === t.id || pending}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary-50 disabled:opacity-50"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: t.color ?? '#64748b' }}
                  />
                  <span className="truncate text-secondary-800">{t.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
