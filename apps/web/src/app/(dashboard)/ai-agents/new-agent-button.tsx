'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Bot } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const AGENT_TYPES = [
  {
    value: 'campaign_builder',
    label: 'Campaign builder',
    desc: 'Drafts subject lines, copy, and audience suggestions from a goal description.',
  },
  {
    value: 'contact_cleanup',
    label: 'Contact cleanup',
    desc: 'Flags duplicates, invalid emails, dormant contacts, suspicious patterns.',
  },
  {
    value: 'segment_optimizer',
    label: 'Segment optimizer',
    desc: 'Suggests new segments based on actual engagement vs current ones.',
  },
  {
    value: 're_engagement',
    label: 'Re-engagement',
    desc: 'Builds win-back sequences for cold contacts with personalized angles.',
  },
  {
    value: 'custom',
    label: 'Custom',
    desc: 'Free-form goal — define what the agent should do in plain language.',
  },
] as const;

type AgentType = (typeof AGENT_TYPES)[number]['value'];

export function NewAgentButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('campaign_builder');
  const [goal, setGoal] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('');

  function close() {
    setOpen(false);
    setName('');
    setAgentType('campaign_builder');
    setGoal('');
    setDescription('');
    setSchedule('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !goal.trim()) {
      toast('error', 'Name + goal are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/ai-agents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          agentType,
          goal: goal.trim(),
          description: description.trim() || undefined,
          config: schedule.trim() ? { schedule: schedule.trim() } : {},
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'Agent created');
      close();
      startTransition(() => router.push(`/ai-agents/${body.data.id}`));
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
        New agent
      </button>

      <Modal open={open} onClose={close} title="New AI agent" size="lg">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Name"
            placeholder="VIP re-engagement"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">Type</label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {AGENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setAgentType(t.value)}
                  className={
                    'flex items-start gap-2 rounded-md border p-2.5 text-left text-sm transition-colors ' +
                    (agentType === t.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-secondary-200 bg-white hover:bg-secondary-50')
                  }
                >
                  <Bot
                    className={`mt-0.5 h-4 w-4 shrink-0 ${agentType === t.value ? 'text-primary-600' : 'text-secondary-400'}`}
                  />
                  <div>
                    <p className="font-medium text-secondary-900">{t.label}</p>
                    <p className="mt-0.5 text-xs text-secondary-500">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">
              Goal
              <span className="ml-1 text-rose-600">*</span>
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={4}
              placeholder="What should this agent do? Be specific about audience, tone, and what 'success' looks like."
              className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
            <p className="text-xs text-secondary-500">
              Plain language. The agent reads this on every run as its system prompt.
            </p>
          </div>

          <Input
            label="Description (optional)"
            placeholder="What people should know when they see this in the list"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Input
            label="Schedule (optional)"
            placeholder="0 9 * * 1 — every Monday 09:00 UTC"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            helperText="Cron expression. Leave blank for manual runs only."
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Create agent
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
