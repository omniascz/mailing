import { apiFetch } from '@/lib/api';
import {
  Building2,
  Users,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Send,
  XCircle,
} from 'lucide-react';

interface PlatformStats {
  orgsTotal: number;
  orgsNew7d: number;
  usersTotal: number;
  contactsTotal: number;
  mailsSent24h: number;
  mailsSent7d: number;
  bounces24h: number;
  complaints24h: number;
}

export const dynamic = 'force-dynamic';

export default async function SuperadminOverviewPage() {
  const stats = await apiFetch<PlatformStats | null>('/api/v1/superadmin/stats', {
    fallback: null,
  });

  if (!stats) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-rose-400" />
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-slate-400">
          /superadmin requires a user with role{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">system_admin</code>. Your current
          session doesn&apos;t have it. Sign in as the platform operator account.
        </p>
      </div>
    );
  }

  const complaintRate =
    stats.mailsSent24h > 0 ? (stats.complaints24h / stats.mailsSent24h) * 100 : 0;
  const bounceRate = stats.mailsSent24h > 0 ? (stats.bounces24h / stats.mailsSent24h) * 100 : 0;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          Cross-tenant view. All counts include every organization on the platform.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Organizations"
          value={stats.orgsTotal}
          delta={`+${stats.orgsNew7d} (7d)`}
          icon={Building2}
        />
        <Stat label="Users" value={stats.usersTotal} icon={Users} />
        <Stat label="Contacts (all orgs)" value={stats.contactsTotal} icon={Users} />
        <Stat label="Sends 24h" value={stats.mailsSent24h} icon={Send} />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Sends 7d" value={stats.mailsSent7d} icon={TrendingUp} />
        <Stat
          label="Bounce rate 24h"
          value={`${bounceRate.toFixed(2)}%`}
          icon={XCircle}
          tone={bounceRate > 5 ? 'danger' : bounceRate > 2 ? 'warning' : 'default'}
        />
        <Stat
          label="Complaint rate 24h"
          value={`${complaintRate.toFixed(3)}%`}
          icon={AlertTriangle}
          tone={complaintRate > 0.3 ? 'danger' : complaintRate > 0.1 ? 'warning' : 'default'}
        />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs text-slate-500">
          <strong>Complaint rate guidance:</strong> &lt; 0.1 % = healthy · 0.1–0.3 % = monitor ·
          &gt; 0.3 % = ISP throttling territory. Gmail Postmaster Tools shows the same metric per
          sending IP/domain.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Mail volume</h2>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Last 24 hours</p>
              <p className="mt-1 text-2xl font-semibold">
                {stats.mailsSent24h.toLocaleString('cs-CZ')}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Last 7 days</p>
              <p className="mt-1 text-2xl font-semibold">
                {stats.mailsSent7d.toLocaleString('cs-CZ')}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            For per-org drill-down see{' '}
            <a href="/superadmin/orgs" className="underline">
              Organizations
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  delta,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  delta?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const accent =
    tone === 'danger'
      ? 'border-rose-500/40 bg-rose-500/5'
      : tone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-slate-800 bg-slate-900';
  return (
    <div className={`rounded-lg border p-4 ${accent}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-400">{label}</p>
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className="text-2xl font-semibold">
        {typeof value === 'number' ? value.toLocaleString('cs-CZ') : value}
      </p>
      {delta ? <p className="mt-0.5 text-xs text-emerald-400">{delta}</p> : null}
    </div>
  );
}
