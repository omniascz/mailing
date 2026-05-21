import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { OrgActions } from './org-actions';

interface OrgDetail {
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    dataRegion: string;
    onboardingCompletedAt: string | null;
    createdAt: string;
    settings: Record<string, unknown>;
    hipaaMode: boolean;
    trackingEuStrict: boolean;
  };
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    emailVerified: boolean;
    lastLoginAt: string | null;
  }>;
  stats: {
    contacts: number;
    campaigns: number;
    sent7d: number;
    sent30d: number;
    bounced30d: number;
    complained30d: number;
    complaintRate: number;
  };
  billing: {
    plan: string;
    stripeCustomerId: string | null;
    stripeStatus: string | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  } | null;
}

export const dynamic = 'force-dynamic';

export default async function SuperadminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await apiFetch<OrgDetail | null>(`/api/v1/superadmin/orgs/${id}`, {
    fallback: null,
  });

  if (!data) notFound();

  const { org, users, stats, billing } = data;
  const suspended = (org.settings as { suspended?: boolean })?.suspended === true;
  const complaintPct = (stats.complaintRate * 100).toFixed(3);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/superadmin/orgs"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organizations
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{org.name}</h1>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-400">
              {org.slug}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Plan:</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-medium text-slate-200">
              {org.plan}
            </span>
            <span>·</span>
            <span>Region: {org.dataRegion.toUpperCase()}</span>
            <span>·</span>
            <span>Created {new Date(org.createdAt).toLocaleDateString('cs-CZ')}</span>
            {org.hipaaMode ? (
              <span className="rounded bg-rose-900/40 px-2 py-0.5 text-rose-200">HIPAA</span>
            ) : null}
            {org.trackingEuStrict ? (
              <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">EU strict</span>
            ) : null}
            {suspended ? (
              <span className="rounded bg-rose-900/60 px-2 py-0.5 font-semibold text-rose-100">
                SUSPENDED
              </span>
            ) : null}
          </div>
        </div>
        <OrgActions orgId={org.id} currentPlan={org.plan} suspended={suspended} />
      </header>

      {/* KPIs */}
      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Contacts" value={stats.contacts} />
        <Stat label="Campaigns" value={stats.campaigns} />
        <Stat label="Sends 7d" value={stats.sent7d} />
        <Stat label="Sends 30d" value={stats.sent30d} />
        <Stat label="Bounces 30d" value={stats.bounced30d} />
        <Stat
          label="Complaints 30d"
          value={stats.complained30d}
          tone={
            stats.complaintRate > 0.003
              ? 'danger'
              : stats.complaintRate > 0.001
                ? 'warning'
                : 'default'
          }
        />
      </section>

      {/* Complaint rate alert */}
      {stats.complaintRate > 0.001 && stats.sent30d > 100 ? (
        <div className="mb-8 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-200">
              Complaint rate {complaintPct} % (over 30d, {stats.sent30d} sends)
            </p>
            <p className="mt-1 text-amber-200/80">
              ISPs throttle at &gt;0.3 %. Consider auditing this org&apos;s lists for opt-in
              quality.
              {stats.complaintRate > 0.003 ? ' Suspending is justified.' : ''}
            </p>
          </div>
        </div>
      ) : null}

      {/* Billing */}
      <section className="mb-8 rounded-lg border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 text-lg font-semibold">Billing</h2>
        {billing ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Plan" value={billing.plan} />
            <Field label="Stripe status" value={billing.stripeStatus ?? '—'} />
            <Field label="Stripe customer" value={billing.stripeCustomerId ?? '—'} mono />
            <Field
              label="Current period ends"
              value={
                billing.currentPeriodEnd
                  ? new Date(billing.currentPeriodEnd).toLocaleDateString('cs-CZ')
                  : '—'
              }
            />
            <Field
              label="Trial ends"
              value={
                billing.trialEndsAt
                  ? new Date(billing.trialEndsAt).toLocaleDateString('cs-CZ')
                  : '—'
              }
            />
          </dl>
        ) : (
          <p className="text-sm text-slate-400">No billing record yet — free tier or pre-Stripe.</p>
        )}
      </section>

      {/* Users */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-4">
          <h2 className="text-lg font-semibold">Users ({users.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Role</th>
              <th className="px-4 py-2 text-left font-medium">Verified</th>
              <th className="px-4 py-2 text-left font-medium">Last login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 text-slate-400">{u.name ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{u.role}</span>
                </td>
                <td className="px-4 py-2">
                  {u.emailVerified ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-slate-400">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('cs-CZ') : 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
      ? 'border-rose-500/40'
      : tone === 'warning'
        ? 'border-amber-500/40'
        : 'border-slate-800';
  return (
    <div className={`rounded-lg border bg-slate-900 p-3 ${accent}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString('cs-CZ')}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
