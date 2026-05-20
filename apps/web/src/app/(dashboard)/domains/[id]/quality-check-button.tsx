'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function QualityCheckButton({ domainId }: { domainId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/domains/${domainId}/quality-check`, {
        credentials: 'include',
      });
      if (!res.ok) {
        toast('error', `Check failed (${res.status})`);
        return;
      }
      toast('success', 'Re-checked DNS records');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" loading={busy || pending} onClick={run}>
      <RefreshCw className="h-4 w-4" />
      Re-check
    </Button>
  );
}
