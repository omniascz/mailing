'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Check, KeyRound } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function CreateKeyButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/api-keys`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        toast('error', `Failed to create key (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: { rawKey: string } };
      setRawKey(body.data.rawKey);
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setOpen(false);
    setName('');
    setRawKey(null);
    setCopied(false);
  }

  async function copy() {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    toast('success', 'Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
      >
        <Plus className="h-4 w-4" />
        New API key
      </button>

      <Modal
        open={open}
        onClose={close}
        title={rawKey ? 'API key created' : 'New API key'}
        size="md"
      >
        {rawKey ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">This is the only time you'll see the full key.</p>
              <p className="mt-1 text-xs">
                Copy it now and store it somewhere safe — we hash it server-side after this dialog.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-secondary-200 bg-secondary-50 p-2">
              <KeyRound className="h-4 w-4 shrink-0 text-secondary-400" />
              <code className="flex-1 truncate font-mono text-xs text-secondary-800">{rawKey}</code>
              <button
                onClick={copy}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Key name"
              placeholder="Production backend"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-secondary-500">
              Used in your audit log — pick something that says where this key is used.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting || pending}>
                Create key
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
