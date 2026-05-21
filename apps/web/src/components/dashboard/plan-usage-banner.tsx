import Link from 'next/link';
import { AlertTriangle, ArrowUpCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Usage {
  plan: string;
  suspended: boolean;
  contacts: { current: number; limit: number; pctUsed: number };
  sends: { current: number; limit: number; pctUsed: number };
}

/**
 * Top-of-dashboard banner that warns when the org is nearing its plan limit
 * (80%) or has been suspended by the platform admin. Rendered in the
 * dashboard layout so it appears on every authenticated page.
 *
 * Server component — `apiFetch` runs SSR with the user's session cookie.
 * Fail-safe: if the call errors (e.g. unauth platform admin without an org
 * dashboard), the banner just disappears.
 */
export async function PlanUsageBanner() {
  const usage = await apiFetch<Usage | null>('/api/v1/billing/capacity', { fallback: null });
  if (!usage) return null;

  // Suspended takes precedence over usage warnings.
  if (usage.suspended) {
    return (
      <div className="mx-auto mb-6 max-w-6xl">
        <div className="flex items-start gap-3 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Sending suspended.</p>
            <p className="mt-0.5 text-rose-800">
              Your account is paused by platform support. New campaigns and queued sends are
              blocked. Contact{' '}
              <a href="mailto:support@mailforge.cz" className="underline">
                support
              </a>{' '}
              to restore.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const contactsPct = usage.contacts.pctUsed;
  const sendsPct = usage.sends.pctUsed;
  const worstPct = Math.max(contactsPct, sendsPct);

  // Only show banner when there's something actionable.
  if (worstPct < 80) return null;

  const overLimit = worstPct >= 100;
  const isFree = usage.plan === 'free';

  return (
    <div className="mx-auto mb-6 max-w-6xl">
      <div
        className={
          'flex items-start gap-3 rounded-md border px-4 py-3 text-sm ' +
          (overLimit
            ? 'border-rose-300 bg-rose-50 text-rose-900'
            : 'border-amber-300 bg-amber-50 text-amber-900')
        }
      >
        <AlertTriangle
          className={'mt-0.5 h-5 w-5 shrink-0 ' + (overLimit ? 'text-rose-600' : 'text-amber-600')}
        />
        <div className="flex-1">
          <p className="font-semibold">
            {overLimit
              ? `${isFree ? 'Plan limit reached — sending is blocked.' : 'Plan limit exceeded — overage will be billed.'}`
              : `You're at ${Math.max(contactsPct, sendsPct).toFixed(0)} % of your ${usage.plan} plan.`}
          </p>
          <p className="mt-0.5">
            Contacts: {usage.contacts.current.toLocaleString('cs-CZ')}
            {usage.contacts.limit > 0 ? ` / ${usage.contacts.limit.toLocaleString('cs-CZ')}` : ''} ·
            Sends this month: {usage.sends.current.toLocaleString('cs-CZ')}
            {usage.sends.limit > 0 ? ` / ${usage.sends.limit.toLocaleString('cs-CZ')}` : ''}
          </p>
        </div>
        <Link
          href="/settings/billing"
          className={
            'inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ' +
            (overLimit
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'bg-amber-600 text-white hover:bg-amber-700')
          }
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
          Upgrade
        </Link>
      </div>
    </div>
  );
}
