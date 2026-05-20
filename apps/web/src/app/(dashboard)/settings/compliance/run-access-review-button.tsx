'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function RunAccessReviewButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [findings, setFindings] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/compliance/access-reviews`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings: findings.trim() || undefined }),
      });
      if (!res.ok) {
        toast('error', `Failed (${res.status})`);
        return;
      }
      toast('success', 'Access review recorded');
      setOpen(false);
      setFindings('');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Record access review
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Record access review" size="md">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-secondary-600">
            Confirm that workspace members and their roles match what your security policy requires
            today. Add any findings — gaps to address, members to remove, etc.
          </p>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-secondary-700">
              Findings (optional)
            </label>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="No issues; all 4 admins remain authorised."
              rows={5}
              className="w-full rounded-md border border-secondary-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy || pending}>
              Record
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
