'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUSES = ['active', 'unsubscribed', 'bounced', 'complained', 'pending'] as const;
const LIFECYCLE_STAGES = [
  '',
  'subscriber',
  'lead',
  'mql',
  'sql',
  'customer',
  'evangelist',
  'other',
];

export interface EditableContact {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  lifecycleStage: string | null;
}

export function EditContactButton({ contact }: { contact: EditableContact }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState(contact.email ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [firstName, setFirstName] = useState(contact.firstName ?? '');
  const [lastName, setLastName] = useState(contact.lastName ?? '');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(
    (STATUSES as readonly string[]).includes(contact.status)
      ? (contact.status as (typeof STATUSES)[number])
      : 'active',
  );
  const [stage, setStage] = useState(contact.lifecycleStage ?? '');

  function reset() {
    setEmail(contact.email ?? '');
    setPhone(contact.phone ?? '');
    setFirstName(contact.firstName ?? '');
    setLastName(contact.lastName ?? '');
    setStatus(
      (STATUSES as readonly string[]).includes(contact.status)
        ? (contact.status as (typeof STATUSES)[number])
        : 'active',
    );
    setStage(contact.lifecycleStage ?? '');
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/contacts/${contact.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          status,
          // Empty string means "unset" — the API expects either a real
          // value or no key at all, so we omit when blank.
          ...(stage ? { lifecycleStage: stage } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      toast('success', 'Contact updated');
      setOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50"
      >
        <Pencil className="h-4 w-4" />
        Edit
      </button>

      <Modal open={open} onClose={close} title="Edit contact" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            helperText="Changing email re-runs MX validation."
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-secondary-700">
                Lifecycle stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="h-10 w-full rounded-md border border-secondary-300 px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s || 'none'} value={s}>
                    {s || '— none —'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-secondary-200 pt-3">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
