'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Curated palette. Less choice-paralysis than a free-form color picker
// and keeps tag colors readable on the dashboard's light theme.
const PALETTE = [
  '#64748b',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function NewTagButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);

  function close() {
    setOpen(false);
    setName('');
    setColor(PALETTE[0]!);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', 'Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tags`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      toast('success', 'Tag created');
      close();
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
      >
        <Plus className="h-4 w-4" />
        New tag
      </button>

      <Modal open={open} onClose={close} title="New tag" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Name"
            placeholder="vip"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            helperText="Lowercase kebab-case is conventional but anything works."
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">Color</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className={
                    'h-8 w-8 rounded-full ring-offset-2 transition-all ' +
                    (color === c ? 'ring-2 ring-secondary-900' : 'hover:scale-110')
                  }
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
