'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Ban } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function ModerateButtons({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function moderate(status: 'approved' | 'rejected' | 'spam') {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/reviews-v2/${id}/moderate`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', `Review ${status}`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const base =
    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50';
  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => moderate('approved')}
        disabled={busy}
        className={`${base} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </button>
      <button
        onClick={() => moderate('rejected')}
        disabled={busy}
        className={`${base} bg-secondary-100 text-secondary-700 hover:bg-secondary-200`}
      >
        <X className="h-3.5 w-3.5" /> Reject
      </button>
      <button
        onClick={() => moderate('spam')}
        disabled={busy}
        className={`${base} bg-rose-50 text-rose-700 hover:bg-rose-100`}
      >
        <Ban className="h-3.5 w-3.5" /> Spam
      </button>
    </div>
  );
}
