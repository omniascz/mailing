'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function RunDecayButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (
      !window.confirm(
        'Run decay now? Old score events past their decay window will be removed from active scores.',
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/lead-scoring/decay`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as {
        data: { contactsRecalculated?: number; eventsDecayed?: number };
      };
      toast(
        'success',
        `Decay ran — ${body.data.contactsRecalculated ?? 0} contacts recalc'd, ${body.data.eventsDecayed ?? 0} events aged out`,
      );
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy || pending}
      className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50 disabled:opacity-50"
    >
      <Clock className="h-4 w-4" />
      {busy ? 'Running…' : 'Run decay'}
    </button>
  );
}
