'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function RevokeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function revoke() {
    if (!window.confirm(`Revoke "${name}"? Any service using this key will start getting 401s.`))
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Failed to revoke (${res.status})`);
        return;
      }
      toast('success', 'Key revoked');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={revoke}
      disabled={busy || pending}
      className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
    >
      {busy || pending ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
