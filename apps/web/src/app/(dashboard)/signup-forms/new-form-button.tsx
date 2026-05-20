'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const EMBED_TYPES = [
  { value: 'inline', label: 'Inline', desc: 'Embed where you place the snippet' },
  { value: 'popup', label: 'Popup', desc: 'Modal triggered by intent/time' },
  { value: 'flyout', label: 'Flyout', desc: 'Slide-in from screen edge' },
  { value: 'standalone', label: 'Standalone', desc: 'Hosted full page on our domain' },
] as const;

type EmbedType = (typeof EMBED_TYPES)[number]['value'];

export function NewFormButton({ lists }: { lists: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [embedType, setEmbedType] = useState<EmbedType>('inline');
  const [listId, setListId] = useState<string>('');

  function close() {
    setOpen(false);
    setName('');
    setEmbedType('inline');
    setListId('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', 'Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/signup-forms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          embedType,
          listId: listId || undefined,
          // Sensible defaults — start with email + first name only.
          // Detail screen lets the user add more fields.
          fields: [
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'firstName', label: 'First name', type: 'text', required: false },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'Form created');
      close();
      startTransition(() => router.push(`/signup-forms/${body.data.id}`));
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
        New form
      </button>

      <Modal open={open} onClose={close} title="New signup form" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Name"
            placeholder="Footer newsletter"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">Embed type</label>
            <div className="grid grid-cols-2 gap-2">
              {EMBED_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEmbedType(t.value)}
                  className={
                    'rounded-md border p-3 text-left text-sm transition-colors ' +
                    (embedType === t.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-secondary-200 bg-white hover:bg-secondary-50')
                  }
                >
                  <p className="font-medium text-secondary-900">{t.label}</p>
                  <p className="mt-0.5 text-xs text-secondary-500">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">
              Auto-add submissions to list (optional)
            </label>
            {lists.length === 0 ? (
              <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-xs text-secondary-500">
                No lists yet — create one first to auto-add submissions.
              </p>
            ) : (
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Don't auto-add</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Create form
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
