'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function ToggleActiveButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/signup-forms/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', active ? 'Form paused' : 'Form resumed');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const Icon = active ? Pause : Play;
  return (
    <button
      onClick={toggle}
      disabled={busy || pending}
      className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50 disabled:opacity-50"
    >
      <Icon className="h-4 w-4" />
      {active ? 'Pause' : 'Resume'}
    </button>
  );
}
