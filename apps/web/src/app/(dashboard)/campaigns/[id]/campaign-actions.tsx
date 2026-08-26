'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Pause, Play, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface MinimalCampaign {
  id: string;
  status:
    | 'draft'
    | 'scheduled'
    | 'queueing'
    | 'sending'
    | 'sent'
    | 'failed'
    | 'paused'
    | 'cancelled';
  /**
   * Why the campaign is paused, when the API knows. 'send_failed' means the
   * dispatch rolled back before anything was queued, so resuming actually sends
   * — which is a different promise to the operator than resuming a send they
   * paused themselves, and the button has to say so.
   */
  pausedReason?: string | null;
}

export function CampaignActions({ campaign }: { campaign: MinimalCampaign }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, path: string, body?: unknown) {
    setBusy(action);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        toast('error', `${action} failed (${res.status}) ${text.slice(0, 100)}`);
        return;
      }
      toast('success', `${action} succeeded`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    const hours = window.prompt('Resend to non-openers after how many hours?', '48');
    if (!hours) return;
    const delayHours = parseInt(hours, 10);
    if (Number.isNaN(delayHours) || delayHours < 1) {
      toast('error', 'Enter a positive integer');
      return;
    }
    await act('Schedule resend', `/api/v1/campaigns/${campaign.id}/schedule-resend`, {
      delayHours,
    });
  }

  const isBusy = (a: string) => busy === a || pending;
  const status = campaign.status;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && (
        <Button
          loading={isBusy('Send')}
          onClick={() => act('Send', `/api/v1/campaigns/${campaign.id}/send`)}
        >
          <Send className="h-4 w-4" />
          Send now
        </Button>
      )}
      {/*
        `queueing` is the splitter turning the audience into batches — short,
        and nothing has been sent yet. Pause is offered here because stopping
        before the batches exist is the one moment stopping is cheap.
      */}
      {(status === 'sending' || status === 'queueing') && (
        <Button
          variant="outline"
          loading={isBusy('Pause')}
          onClick={() => act('Pause', `/api/v1/campaigns/${campaign.id}/pause`)}
        >
          <Pause className="h-4 w-4" />
          Pause
        </Button>
      )}
      {/*
        No action on `failed`: every batch reported and none of them sent
        anything, so there is nothing to resume and nothing to cancel. Sending
        it again is a new send from a copy, which is a decision, not a button
        that looks like a retry.
      */}
      {/*
        Both go to the same endpoint — the API decides from paused_reason
        whether to enqueue — but they promise different things, so they are
        labelled differently. A send that rolled back queued nothing, and
        pressing this really does send. A pause the operator chose does not
        re-send, because batches may already be out.
      */}
      {status === 'paused' && campaign.pausedReason === 'send_failed' && (
        <Button
          loading={isBusy('Try sending again')}
          onClick={() => act('Try sending again', `/api/v1/campaigns/${campaign.id}/resume`)}
        >
          <Send className="h-4 w-4" />
          Try sending again
        </Button>
      )}
      {status === 'paused' && campaign.pausedReason !== 'send_failed' && (
        <Button
          loading={isBusy('Resume')}
          onClick={() => act('Resume', `/api/v1/campaigns/${campaign.id}/resume`)}
        >
          <Play className="h-4 w-4" />
          Resume
        </Button>
      )}
      {(status === 'scheduled' || status === 'paused') && (
        <Button
          variant="danger"
          loading={isBusy('Cancel')}
          onClick={() => act('Cancel', `/api/v1/campaigns/${campaign.id}/cancel`)}
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      )}
      {status === 'sent' && (
        <Button variant="outline" loading={isBusy('Schedule resend')} onClick={resend}>
          <RefreshCw className="h-4 w-4" />
          Resend to non-openers
        </Button>
      )}
    </div>
  );
}
