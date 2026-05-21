'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function BillingActions({
  currentPlan,
  hasStripeCustomer,
}: {
  currentPlan: string;
  hasStripeCustomer: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function openPortal() {
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/settings/billing`;
      const res = await fetch(`${API_BASE}/api/v1/billing/portal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl }),
      });
      if (!res.ok) {
        alert(`Failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as { data: { url?: string } };
      if (body.data.url) window.location.href = body.data.url;
    } finally {
      setBusy(false);
    }
  }

  if (currentPlan === 'free' || !hasStripeCustomer) {
    return (
      <p className="mt-2 text-xs text-secondary-500">
        You&apos;re on the Free plan. Pick a paid tier below to enable card billing.
      </p>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={openPortal}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-secondary-300 bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 hover:border-secondary-400"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {busy ? 'Opening…' : 'Manage in Stripe portal'}
      </button>
    </div>
  );
}
