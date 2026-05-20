'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function CreateWebhookButton({ supportedEvents }: { supportedEvents: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function toggle(ev: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || selected.size === 0) {
      toast('error', 'URL and at least one event are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/webhooks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          events: Array.from(selected),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      toast('success', 'Webhook created');
      setOpen(false);
      setUrl('');
      setDescription('');
      setSelected(new Set());
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
        New webhook
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="New webhook" size="lg">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Endpoint URL"
            placeholder="https://api.yourservice.com/forgemsg/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            autoFocus
            required
          />
          <Input
            label="Description (optional)"
            placeholder="Sync events to Snowflake"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">
              Events to receive
              <span className="ml-2 text-xs font-normal text-secondary-400">
                ({selected.size} selected)
              </span>
            </label>
            <div className="max-h-64 overflow-y-auto rounded-md border border-secondary-200 p-2">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {supportedEvents.map((ev) => (
                  <label
                    key={ev}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(ev)}
                      onChange={() => toggle(ev)}
                      className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="font-mono text-xs text-secondary-700">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Create webhook
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
