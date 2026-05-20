'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function DeleteDomainButton({ id, domain }: { id: string; domain: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Delete ${domain}? Active campaigns using this domain will stop sending and you'll need to reauthorise before adding it back.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/domains/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', 'Domain removed');
      startTransition(() => router.push('/domains'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy || pending}
      className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      Delete
    </button>
  );
}
