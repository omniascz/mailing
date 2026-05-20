'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export function TagActions({ tag }: { tag: Tag }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? PALETTE[0]!);

  function close() {
    setOpen(false);
    setName(tag.name);
    setColor(tag.color ?? PALETTE[0]!);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tags/${tag.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      toast('success', 'Tag updated');
      setOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete tag "${tag.name}"? Contacts won't lose their data — they just lose this label.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tags/${tag.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', 'Tag deleted');
      startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex justify-end gap-3 text-xs font-medium">
      <button onClick={() => setOpen(true)} className="text-secondary-700 hover:text-secondary-900">
        Edit
      </button>
      <button
        onClick={remove}
        disabled={deleting || pending}
        className="text-rose-600 hover:text-rose-800 disabled:opacity-50"
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>

      <Modal open={open} onClose={close} title={`Edit "${tag.name}"`} size="md">
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
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
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
