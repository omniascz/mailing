'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, ArrowUpCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const PLANS = ['free', 'starter', 'pro', 'business', 'enterprise'] as const;

export function OrgActions({
  orgId,
  currentPlan,
  suspended,
}: {
  orgId: string;
  currentPlan: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(currentPlan);

  async function toggleSuspend() {
    const action = suspended ? 'resume' : 'suspend';
    if (!confirm(`Confirm: ${action} this org?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/superadmin/orgs/${orgId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) router.refresh();
      else alert(`Failed (${res.status})`);
    } finally {
      setBusy(false);
    }
  }

  async function changePlan() {
    if (plan === currentPlan) return;
    if (!confirm(`Change plan from ${currentPlan} to ${plan}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/superadmin/orgs/${orgId}/plan`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) router.refresh();
      else alert(`Failed (${res.status})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1">
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          disabled={busy}
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          onClick={changePlan}
          disabled={busy || plan === currentPlan}
          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700 disabled:opacity-50"
        >
          <ArrowUpCircle className="h-3 w-3" /> Apply
        </button>
      </div>
      <button
        onClick={toggleSuspend}
        disabled={busy}
        className={
          'inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium ' +
          (suspended
            ? 'bg-emerald-700 text-emerald-100 hover:bg-emerald-600'
            : 'bg-rose-700 text-rose-100 hover:bg-rose-600')
        }
      >
        {suspended ? (
          <>
            <Play className="h-3 w-3" /> Resume sending
          </>
        ) : (
          <>
            <Pause className="h-3 w-3" /> Suspend sending
          </>
        )}
      </button>
    </div>
  );
}
