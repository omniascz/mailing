'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Field {
  id: string;
  name: string;
  key: string;
}

export function FieldActions({ field }: { field: Field }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Delete "${field.name}"? Existing values in contacts.custom_fields aren't purged — they just become unreadable in segments.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/custom-fields/${field.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', 'Field deleted');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy || pending}
      className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
    >
      {busy || pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
