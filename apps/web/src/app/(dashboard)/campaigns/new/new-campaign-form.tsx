'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { buildCreatePayload } from './create-payload';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const TYPES = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
  { value: 'voice', label: 'Voice' },
] as const;

interface AudienceList {
  id: string;
  name: string;
  count: number;
}

export function NewCampaignForm({ lists }: { lists: AudienceList[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('email');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [listId, setListId] = useState<string>('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', 'Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildCreatePayload({ name, type, listId, subject, preheader, fromName, fromEmail }),
        ),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Couldn't create draft (${res.status}) ${text.slice(0, 120)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'Draft created');
      startTransition(() => router.push(`/campaigns/${body.data.id}`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Input
        label="Campaign name"
        placeholder="Spring sale — list A"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Channel</label>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (type === t.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-secondary-700">Audience (optional)</label>
        {lists.length === 0 ? (
          <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-xs text-secondary-500">
            No lists yet — you can create the draft now and pick a list on the detail page later.
          </p>
        ) : (
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Pick a list later</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.count.toLocaleString('cs-CZ')})
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-secondary-500">
          You can refine with a segment or exclusion list on the detail page.
        </p>
      </div>

      {type === 'email' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Subject"
            placeholder="Your weekend deal is inside"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Input
            label="Preheader"
            placeholder="A peek at what's in this email"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
          />
          <Input
            label="From name"
            placeholder="ForgeMsg Team"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
          />
          <Input
            label="From email"
            type="email"
            placeholder="news@yourdomain.com"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={submitting || pending}>
          Create draft
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/campaigns')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
