'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function UpgradeButton({ tier, disabled }: { tier: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    try {
      const successUrl = `${window.location.origin}/settings/billing?checkout=success`;
      const cancelUrl = `${window.location.origin}/settings/billing?checkout=cancel`;
      const res = await fetch(`${API_BASE}/api/v1/billing/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, successUrl, cancelUrl }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        alert(`Upgrade failed (${res.status}) ${txt.slice(0, 160)}`);
        return;
      }
      const body = (await res.json()) as { data: { url?: string } };
      if (body.data.url) window.location.href = body.data.url;
      else alert('No checkout URL returned.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={upgrade}
      disabled={disabled || busy}
      className="block w-full rounded-md bg-primary-600 py-2 text-center text-xs font-medium text-white hover:bg-primary-700 disabled:bg-primary-300"
    >
      {busy ? 'Opening…' : `Upgrade to ${tier}`}
    </button>
  );
}
