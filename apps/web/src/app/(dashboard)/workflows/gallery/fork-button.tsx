'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function ForkButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function fork() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workflow-templates/${slug}/fork`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast('error', `Couldn't fork template (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', `${name} added to your drafts`);
      startTransition(() => router.push(`/workflows/${body.data.id}`));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" loading={loading || pending} onClick={fork}>
      Use this template
    </Button>
  );
}
