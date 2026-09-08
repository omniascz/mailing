'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { buildCreateFromTemplatePayload, createdCampaignHref } from './create-campaign-payload';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * The step the library was missing.
 *
 * "Use this template" clones a built-in design into the saved library and stops
 * there, so a saved template was the end of the road: 106 designs and no way to
 * send any of them. This is the road.
 *
 * It lives on the template card rather than as a picker inside the new-campaign
 * form because the library is already where a person browses designs — a picker
 * in the form would be a second gallery, with its own filters and thumbnails,
 * competing with this page. The card is also where the product's only other
 * per-template action already is.
 */
export function CreateCampaignButton({ templateId, name }: { templateId: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/saved-templates/${templateId}/create-campaign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCreateFromTemplatePayload({ name: '' })),
      });
      if (!res.ok) {
        toast('error', `Could not start a campaign (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data?: { id?: string } };
      const id = body.data?.id;
      if (!id) {
        // A 2xx without an id means the campaign may exist and we cannot say
        // where. Saying so beats navigating somewhere arbitrary.
        toast('error', 'The campaign was created but its address is missing — check Campaigns.');
        return;
      }
      toast('success', `Campaign started from "${name}"`);
      startTransition(() => router.push(createdCampaignHref(id)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={create}
      disabled={busy || pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary-600 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
    >
      <Send className="h-4 w-4" />
      {busy || pending ? 'Starting…' : 'Create campaign'}
    </button>
  );
}
