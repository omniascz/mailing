'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function VipToggle({
  contactId,
  initialIsVip,
}: {
  contactId: string;
  initialIsVip: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isVip, setIsVip] = useState(initialIsVip);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    const next = !isVip;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/contacts/${contactId}/vip`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVip: next }),
      });
      if (!res.ok) {
        toast('error', `Failed to update VIP (${res.status})`);
        return;
      }
      setIsVip(next);
      toast('success', next ? 'Marked as VIP' : 'VIP removed');
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      title={isVip ? 'Remove VIP' : 'Mark as VIP'}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
        isVip
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-secondary-300 bg-white text-secondary-500 hover:bg-secondary-50'
      } disabled:opacity-50`}
    >
      <Star className={`h-3.5 w-3.5 ${isVip ? 'fill-amber-400 text-amber-500' : ''}`} />
      VIP
    </button>
  );
}
