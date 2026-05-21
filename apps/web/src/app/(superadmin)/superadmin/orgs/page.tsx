import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ExternalLink, ShieldCheck } from 'lucide-react';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  dataRegion: string;
  onboardingCompletedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  stats: {
    contacts: number;
    campaigns: number;
    sentLast30d: number;
  };
}

export const dynamic = 'force-dynamic';

const PLAN_COLOR: Record<string, string> = {
  free: 'bg-slate-700 text-slate-200',
  starter: 'bg-sky-600/30 text-sky-200',
  pro: 'bg-violet-600/30 text-violet-200',
  business: 'bg-amber-600/30 text-amber-200',
  enterprise: 'bg-rose-600/30 text-rose-200',
};

export default async function SuperadminOrgsPage() {
  const orgs = await apiFetch<OrgRow[]>('/api/v1/superadmin/orgs', { fallback: [] });

  if (orgs.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-rose-400" />
        <h1 className="text-lg font-semibold">No orgs yet — or access denied</h1>
        <p className="mt-2 text-sm text-slate-400">
          The endpoint returned an empty list. Either there are no organizations on the platform, or
          your session doesn&apos;t have the{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">system_admin</code> role.
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <p className="mt-1 text-sm text-slate-400">
          {orgs.length} total · click an org to see full stats, plan, and users.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-left font-medium">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Region</th>
              <th className="px-4 py-3 text-right font-medium">Contacts</th>
              <th className="px-4 py-3 text-right font-medium">Campaigns</th>
              <th className="px-4 py-3 text-right font-medium">Sends 30d</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {orgs.map((o) => (
              <tr key={o.id} className={o.deletedAt ? 'opacity-50' : 'hover:bg-slate-800/40'}>
                <td className="px-4 py-3 font-medium text-slate-100">{o.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{o.slug}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      PLAN_COLOR[o.plan] ?? 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {o.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400 uppercase">{o.dataRegion}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {o.stats.contacts.toLocaleString('cs-CZ')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{o.stats.campaigns}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {o.stats.sentLast30d.toLocaleString('cs-CZ')}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(o.createdAt).toLocaleDateString('cs-CZ')}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/superadmin/orgs/${o.id}`}
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
    </div>
  );
}
