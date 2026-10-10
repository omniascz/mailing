'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Re-verify the DNS records now, and store the result.
 *
 * "Re-check" beside it only reads (GET /quality-check). What the pre-send
 * check reads — SPF, DKIM and DMARC verified on the domain — is written by the
 * daily DNS sweep, so after fixing a record a customer waited up to a day.
 * This runs that same sweep for the organisation (POST /dns-health/recheck),
 * which checks every domain that has a DKIM key.
 */
export function RecheckDnsButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/dns-health/recheck`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text;
        try {
          message = (JSON.parse(text) as { message?: string }).message ?? text;
        } catch {
          /* not JSON: show it as it came */
        }
        toast('error', `Ověření se nepovedlo (${res.status}): ${message}`);
        return;
      }
      toast('success', 'DNS záznamy ověřeny znovu');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" loading={busy || pending} onClick={run}>
      <ShieldCheck className="h-4 w-4" />
      Znovu ověřit DNS
    </Button>
  );
}
