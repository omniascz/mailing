'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function UseTemplateButton({ templateId, name }: { templateId: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function use() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/templates/${templateId}/use`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', `Saved "${name}" to your library`);
      startTransition(() => router.push('/templates?tab=saved'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={use}
      disabled={busy || pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
    >
      <Plus className="h-4 w-4" />
      {busy || pending ? 'Saving…' : 'Use this template'}
    </button>
  );
}
