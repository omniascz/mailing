import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface AbuseRow {
  id: string;
  orgId: string;
  orgName: string;
  signalType: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  observedValue: string;
  threshold: string;
  sampleSize: number;
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
  actionTaken: string;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const SEVERITY_COLOR: Record<AbuseRow['severity'], string> = {
  info: 'bg-slate-700 text-slate-200',
  low: 'bg-sky-600/30 text-sky-200',
  medium: 'bg-amber-600/30 text-amber-200',
  high: 'bg-orange-600/40 text-orange-200',
  critical: 'bg-rose-600/50 text-rose-100',
};

const STATUS_COLOR: Record<AbuseRow['status'], string> = {
  open: 'bg-rose-700 text-rose-100',
  acknowledged: 'bg-amber-700 text-amber-100',
  investigating: 'bg-sky-700 text-sky-100',
  resolved: 'bg-emerald-700 text-emerald-100',
  false_positive: 'bg-slate-700 text-slate-300',
};

export default async function SuperadminAbusePage() {
  const events = await apiFetch<AbuseRow[]>('/api/v1/superadmin/abuse?limit=100', { fallback: [] });
  const openCount = events.filter((e) => e.status === 'open').length;
  const criticalCount = events.filter(
    (e) => e.severity === 'critical' && e.status === 'open',
  ).length;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Abuse events</h1>
        <p className="mt-1 text-sm text-slate-400">
          ARF complaints, bounce/complaint spikes, blacklist hits, spam trap hits. Last 100 events
          across all orgs.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Open" value={openCount} tone={openCount > 0 ? 'warning' : 'default'} />
        <Stat
          label="Critical (open)"
          value={criticalCount}
          tone={criticalCount > 0 ? 'danger' : 'default'}
        />
        <Stat label="Total (visible)" value={events.length} />
      </section>

      {events.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          No abuse events. Either the abuse-detection job hasn&apos;t run yet, or your fleet is
          clean.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="px-4 py-3 text-left font-medium">Severity</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Org</th>
                <th className="px-4 py-3 text-left font-medium">Signal</th>
                <th className="px-4 py-3 text-left font-medium">Summary</th>
                <th className="px-4 py-3 text-right font-medium">Observed</th>
                <th className="px-4 py-3 text-right font-medium">Threshold</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(e.createdAt).toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOR[e.severity]}`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[e.status]}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-100">{e.orgName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{e.signalType}</td>
                  <td className="px-4 py-3 max-w-md truncate text-slate-300">{e.summary}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    {parseFloat(e.observedValue).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {parseFloat(e.threshold).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/superadmin/orgs/${e.orgId}`}
                      className="inline-flex items-center gap-1 text-xs text-primary-300 hover:text-primary-200"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const accent =
    tone === 'danger'
      ? 'border-rose-500/40 bg-rose-500/5'
      : tone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/5'
        : 'border-slate-800 bg-slate-900';
  const Icon = tone === 'danger' ? AlertTriangle : null;
  return (
    <div className={`rounded-lg border p-4 ${accent}`}>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        {Icon ? <Icon className="h-3.5 w-3.5 text-rose-400" /> : null}
      </div>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString('cs-CZ')}</p>
    </div>
  );
}
