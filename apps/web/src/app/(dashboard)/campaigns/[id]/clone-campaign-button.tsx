'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { buildClonePayload, type CloneSource } from './clone-payload';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Client-side clone — no dedicated backend endpoint exists. We POST a
 * new campaign with the same content/audience but a "Copy of …" name
 * and force draft status (the create endpoint defaults to draft so the
 * clone is editable from the moment it lands).
 */
export function CloneCampaignButton({ campaign }: { campaign: CloneSource }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function clone() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildClonePayload(campaign)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Clone failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'Campaign cloned');
      startTransition(() => router.push(`/campaigns/${body.data.id}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={clone}
      disabled={busy || pending}
      className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50 disabled:opacity-50"
    >
      <Copy className="h-4 w-4" />
      {busy ? 'Cloning…' : 'Clone'}
    </button>
  );
}
