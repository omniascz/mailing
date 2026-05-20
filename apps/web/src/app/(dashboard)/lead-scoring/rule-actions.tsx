'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Rule {
  id: string;
  eventType: string;
  points: number;
  active: boolean;
}

export function RuleActions({ rule }: { rule: Rule }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle() {
    setBusy('toggle');
    try {
      const res = await fetch(`${API_BASE}/api/v1/lead-scoring/rules/${rule.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', rule.active ? 'Rule paused' : 'Rule resumed');
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete rule for "${rule.eventType}"? Existing score events stay — only the rule goes.`,
      )
    )
      return;
    setBusy('delete');
    try {
      const res = await fetch(`${API_BASE}/api/v1/lead-scoring/rules/${rule.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', 'Rule deleted');
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex justify-end gap-3 text-xs font-medium">
      <button
        onClick={toggle}
        disabled={busy !== null || pending}
        className="text-secondary-700 hover:text-secondary-900 disabled:opacity-50"
      >
        {busy === 'toggle' ? '…' : rule.active ? 'Pause' : 'Resume'}
      </button>
      <button
        onClick={remove}
        disabled={busy !== null || pending}
        className="text-rose-600 hover:text-rose-800 disabled:opacity-50"
      >
        {busy === 'delete' ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
