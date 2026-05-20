'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function SeedControlsButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/compliance/controls/seed`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        toast('error', `Seeding failed (${res.status})`);
        return;
      }
      toast('success', 'Default controls loaded');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={seed} loading={busy || pending}>
      <Sparkles className="h-4 w-4" />
      Seed default controls
    </Button>
  );
}
