'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual', desc: 'Run on demand, no automatic trigger.' },
  { value: 'list_subscribe', label: 'List subscribe', desc: 'When a contact joins a list.' },
  { value: 'tag_added', label: 'Tag added', desc: 'When a contact gets tagged.' },
  { value: 'date_field', label: 'Date field', desc: 'Triggered by birthday / renewal date etc.' },
  { value: 'api_event', label: 'Custom API event', desc: 'Triggered by a POST from your code.' },
  { value: 'form_submit', label: 'Form submit', desc: 'When a signup form is submitted.' },
  { value: 'purchase_event', label: 'Purchase', desc: 'When a contact buys something.' },
  { value: 'name_day_today', label: 'CZ jmeniny', desc: "On the contact's name day." },
] as const;

type TriggerType = (typeof TRIGGER_TYPES)[number]['value'];

export function NewWorkflowForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('list_subscribe');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', 'Name is required');
      return;
    }
    setSubmitting(true);
    try {
      // Seed graph: trigger → wait 1 day → send_email
      // Gives the user something to inspect/edit instead of an empty
      // canvas. Same shape the gallery templates use so the editor
      // renderer doesn't have to special-case "empty".
      const nodes = [
        { id: 't', type: 'trigger', config: { triggerType } },
        { id: 'w1', type: 'wait', config: { duration: { days: 1, hours: 0 } } },
        {
          id: 'e1',
          type: 'send_email',
          config: { subject: 'Hello {{contact.first_name|vocative}}' },
        },
      ];
      const edges = [
        { id: 'e0', source: 't', target: 'w1' },
        { id: 'e1', source: 'w1', target: 'e1' },
      ];

      const res = await fetch(`${API_BASE}/api/v1/workflows`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          triggerType,
          triggerConfig: {},
          nodes,
          edges,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'Workflow created');
      startTransition(() => router.push(`/workflows/${body.data.id}`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Input
        label="Name"
        placeholder="Welcome — newsletter subscribers"
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
          rows={2}
          placeholder="What this automation should do, who it's for."
          className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Trigger</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TRIGGER_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTriggerType(t.value)}
              className={
                'rounded-md border p-3 text-left text-sm transition-colors ' +
                (triggerType === t.value
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-secondary-200 bg-white hover:bg-secondary-50')
              }
            >
              <p className="font-medium text-secondary-900">{t.label}</p>
              <p className="mt-0.5 text-xs text-secondary-500">{t.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-secondary-500">
          You can change the trigger config later. The starter graph adds a 1-day wait + first email
          — edit them on the workflow detail.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={submitting || pending}>
          Create workflow
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/workflows')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
