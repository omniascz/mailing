'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface SendTestResponse {
  data: { sentTo: string; from: string };
}

export function SendTestButton({ domainId }: { domainId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/domains/${domainId}/send-test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        toast('error', `Send failed (${res.status}) ${txt.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as SendTestResponse;
      toast(
        'success',
        `Test queued — check ${body.data.sentTo}. Delivery may take 30s–2min depending on inbox provider.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" loading={busy} onClick={run}>
      <Send className="h-4 w-4" />
      Send test
    </Button>
  );
}
