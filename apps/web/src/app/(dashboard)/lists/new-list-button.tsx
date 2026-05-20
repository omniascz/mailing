'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function NewListButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [doubleOptIn, setDoubleOptIn] = useState(true);
  const [thankYouUrl, setThankYouUrl] = useState('');

  function close() {
    setOpen(false);
    setName('');
    setDescription('');
    setDoubleOptIn(true);
    setThankYouUrl('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', 'Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/lists`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          doubleOptIn,
          thankYouUrl: thankYouUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'List created');
      close();
      startTransition(() => router.push(`/lists/${body.data.id}`));
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
        New list
      </button>

      <Modal open={open} onClose={close} title="New list" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Name"
            placeholder="Newsletter — CZ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this list is for and who's expected to be on it."
              className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-secondary-200 p-3">
            <input
              type="checkbox"
              checked={doubleOptIn}
              onChange={(e) => setDoubleOptIn(e.target.checked)}
              className="mt-0.5 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="text-sm font-medium text-secondary-900">Require double opt-in</p>
              <p className="mt-0.5 text-xs text-secondary-500">
                Subscribers confirm via email before they're added. Strongly recommended for
                newsletter lists in the EU.
              </p>
            </div>
          </label>
          <Input
            label="Thank-you URL (optional)"
            type="url"
            placeholder="https://yourdomain.com/thanks"
            value={thankYouUrl}
            onChange={(e) => setThankYouUrl(e.target.value)}
          />
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
