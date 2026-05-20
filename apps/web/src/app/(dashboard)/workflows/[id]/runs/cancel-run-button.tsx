'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function CancelRunButton({ workflowId, runId }: { workflowId: string; runId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!window.confirm('Cancel this run? Any pending steps for this contact will be skipped.'))
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workflows/${workflowId}/runs/${runId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        toast('error', `Cancel failed (${res.status})`);
        return;
      }
      toast('success', 'Run cancelled');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={cancel}
      disabled={busy || pending}
      className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
    >
      {busy || pending ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}
