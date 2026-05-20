'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function SeedDefaultsButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/lead-scoring/rules/seed-defaults`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', 'Default rules seeded');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={seed}
      disabled={busy || pending}
      className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50 disabled:opacity-50"
    >
      <Sparkles className="h-4 w-4" />
      {busy ? 'Seeding…' : 'Seed defaults'}
    </button>
  );
}
