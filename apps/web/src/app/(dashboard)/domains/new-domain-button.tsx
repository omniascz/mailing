'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Info } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function NewDomainButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [domain, setDomain] = useState('');
  const [mailSubdomain, setMailSubdomain] = useState('');

  function close() {
    setOpen(false);
    setDomain('');
    setMailSubdomain('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim().toLowerCase();
    if (!d || !/^[a-z0-9.-]+$/.test(d)) {
      toast('error', 'Enter a valid domain (e.g. yourdomain.com)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/domains`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: d,
          mailSubdomain: mailSubdomain.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `Failed (${res.status}) ${text.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as { data: { id: string } };
      toast('success', 'Domain added — now publish the DNS records');
      close();
      startTransition(() => router.push(`/domains/${body.data.id}`));
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
        Add domain
      </button>

      <Modal open={open} onClose={close} title="Add sending domain" size="md">
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Domain"
            placeholder="yourdomain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Mail subdomain (optional)"
            placeholder="mail.yourdomain.com"
            value={mailSubdomain}
            onChange={(e) => setMailSubdomain(e.target.value)}
            helperText="Defaults to mail.<your-domain>. The subdomain hosts SPF and DKIM TXT records."
          />
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">DNS records on the next screen</p>
              <p className="mt-0.5">
                After adding the domain we'll show 4 records (SPF, DKIM, Return-Path, DMARC).
                Publish them at your DNS provider, then run the "Re-check" button to verify.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting || pending}>
              Add domain
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
