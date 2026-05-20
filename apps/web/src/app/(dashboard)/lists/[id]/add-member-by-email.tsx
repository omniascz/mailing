'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ContactHit {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface ContactListResponse {
  data: ContactHit[];
}

/**
 * Two-step add-by-email: type in an email, we search the existing
 * contacts pool (so admins don't accidentally create duplicates), and
 * either offer to add a matching contact or fall back to creating a new
 * one then attaching it. Keeps the heavy "pick a contact from N rows"
 * UX deferred until we add a real picker.
 */
export function AddMemberByEmail({ listId }: { listId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    try {
      // 1) Look up the contact by email
      const search = await fetch(
        `${API_BASE}/api/v1/contacts?search=${encodeURIComponent(trimmed)}&limit=5`,
        { credentials: 'include' },
      );
      if (!search.ok) {
        toast('error', `Lookup failed (${search.status})`);
        return;
      }
      const searchBody = (await search.json()) as
        | ContactListResponse
        | { data: ContactListResponse };
      const hits =
        'data' in searchBody && Array.isArray((searchBody as ContactListResponse).data)
          ? (searchBody as ContactListResponse).data
          : ((searchBody as { data: ContactListResponse }).data?.data ?? []);

      let contactId = hits.find((h) => h.email?.toLowerCase() === trimmed)?.id;

      // 2) Create if not found
      if (!contactId) {
        const created = await fetch(`${API_BASE}/api/v1/contacts`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        });
        if (!created.ok) {
          const text = await created.text().catch(() => '');
          toast('error', `Create failed (${created.status}) ${text.slice(0, 120)}`);
          return;
        }
        const cbody = (await created.json()) as { data: { id: string } };
        contactId = cbody.data.id;
      }

      // 3) Attach to list
      const attach = await fetch(`${API_BASE}/api/v1/lists/${listId}/contacts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      if (!attach.ok && attach.status !== 204) {
        toast('error', `Attach failed (${attach.status})`);
        return;
      }
      toast('success', `${trimmed} added to list`);
      setEmail('');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="h-10 w-full rounded-md border border-secondary-300 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <Button type="submit" loading={busy || pending}>
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </form>
  );
}
