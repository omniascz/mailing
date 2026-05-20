'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function WebhookActions({ id, url, active }: { id: string; url: string; active: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function send(action: string, opts: { method: string; body?: unknown }) {
    setBusy(action);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/webhooks/${id}${opts.method === 'POST' && action === 'test' ? '/test' : ''}`,
        {
          method: opts.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        },
      );
      if (!res.ok && res.status !== 204) {
        toast('error', `${action} failed (${res.status})`);
        return;
      }
      toast('success', `${action} ok`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete webhook for ${url}?`)) return;
    await send('delete', { method: 'DELETE' });
  }

  const isBusy = (a: string) => busy === a || pending;

  return (
    <div className="flex shrink-0 items-center gap-3">
      <button
        onClick={() => send('test', { method: 'POST' })}
        disabled={isBusy('test')}
        className="text-sm font-medium text-primary-700 hover:text-primary-900 disabled:opacity-50"
      >
        {isBusy('test') ? 'Sending…' : 'Send test'}
      </button>
      <button
        onClick={() =>
          send(active ? 'paused' : 'resumed', { method: 'PUT', body: { active: !active } })
        }
        disabled={isBusy(active ? 'paused' : 'resumed')}
        className="text-sm font-medium text-secondary-700 hover:text-secondary-900 disabled:opacity-50"
      >
        {active ? 'Pause' : 'Resume'}
      </button>
      <button
        onClick={remove}
        disabled={isBusy('delete')}
        className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
