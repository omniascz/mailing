'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function NewRuleButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [eventType, setEventType] = useState('');
  const [points, setPoints] = useState(10);
  const [decayDays, setDecayDays] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  function close() {
    setOpen(false);
    setEventType('');
    setPoints(10);
    setDecayDays('');
    setDescription('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventType.trim()) {
      toast('error', 'Event type required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/lead-scoring/rules`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: eventType.trim(),
          points,
          decayDays: decayDays === '' ? undefined : Number(decayDays),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Rule created');
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
        New rule
      </button>

      <Modal open={open} onClose={close} title="New scoring rule" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Event type"
            placeholder="email_clicked, pricing_page_view, demo_booked …"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            autoFocus
            required
            helperText="snake_case identifier. Matched against custom API events + system events."
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">Points</label>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="text-xs text-secondary-500">
                Positive = lead heating up. Negative = cooling.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">
                Decay (days, optional)
              </label>
              <input
                type="number"
                min={1}
                max={3650}
                value={decayDays}
                onChange={(e) => setDecayDays(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="never"
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="text-xs text-secondary-500">
                After N days, this event's contribution decays to 0.
              </p>
            </div>
          </div>
          <Input
            label="Description (optional)"
            placeholder="What this rule represents"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
