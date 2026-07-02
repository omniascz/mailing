'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Store } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Connection {
  id: string;
  platform: string;
  name: string;
}

export function StoreSyncButton({
  batchId,
  connections,
}: {
  batchId: string;
  connections: Connection[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');

  if (connections.length === 0) {
    return (
      <p className="text-sm text-secondary-500">
        Connect a Shopify or WooCommerce store first to sync codes for checkout redemption.
      </p>
    );
  }

  async function sync() {
    if (!connectionId) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/coupons/batches/${batchId}/sync-to-store`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Sync failed (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      const body = (await res.json()) as { data?: { codesPushed?: number } };
      toast('success', `Synced ${body.data?.codesPushed ?? 0} codes to the store`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={connectionId}
        onChange={(e) => setConnectionId(e.target.value)}
        className="h-9 rounded-md border border-secondary-300 bg-white px-3 text-sm"
      >
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.platform})
          </option>
        ))}
      </select>
      <button
        onClick={sync}
        disabled={busy || pending}
        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        <Store className="h-4 w-4" />
        {busy ? 'Syncing…' : 'Sync to store'}
      </button>
    </div>
  );
}
