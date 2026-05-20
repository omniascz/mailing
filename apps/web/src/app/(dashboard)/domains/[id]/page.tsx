import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { QualityCheckButton } from './quality-check-button';
import { DeleteDomainButton } from './delete-domain-button';
import { SendTestButton } from './send-test-button';

interface DomainDetail {
  id: string;
  domain: string;
  status: string;
  spfStatus?: string | null;
  dkimStatus?: string | null;
  dmarcStatus?: string | null;
  returnPathStatus?: string | null;
  bimiStatus?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  dnsRecords?: Array<{
    type: string;
    host: string;
    value: string;
    purpose?: string;
    status?: string;
  }>;
}

interface QualityCheck {
  ready: boolean;
  errorCount: number;
  warningCount: number;
  checks: Array<{
    name: string;
    label: string;
    severity: 'error' | 'warning' | 'info';
    status: 'pass' | 'fail' | 'pending';
    detail?: string;
  }>;
}

function iconFor(status?: string | null) {
  if (status === 'pass' || status === 'valid' || status === 'authenticated') return CheckCircle2;
  if (status === 'fail' || status === 'invalid') return XCircle;
  return AlertTriangle;
}

function colorFor(status?: string | null) {
  if (status === 'pass' || status === 'valid' || status === 'authenticated')
    return 'text-emerald-600';
  if (status === 'fail' || status === 'invalid') return 'text-rose-600';
  return 'text-amber-600';
}

export const dynamic = 'force-dynamic';

export default async function DomainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [domain, quality] = await Promise.all([
    apiFetch<DomainDetail | null>(`/api/v1/domains/${id}`, { fallback: null }),
    apiFetch<QualityCheck | null>(`/api/v1/domains/${id}/quality-check`, { fallback: null }),
  ]);
  if (!domain) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/domains"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to domains
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">{domain.domain}</h1>
          <p className="mt-1 text-xs text-secondary-500">
            Added {new Date(domain.createdAt).toLocaleDateString('cs-CZ')}
            {domain.verifiedAt
              ? ` · Verified ${new Date(domain.verifiedAt).toLocaleDateString('cs-CZ')}`
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <SendTestButton domainId={domain.id} />
          <QualityCheckButton domainId={domain.id} />
          <DeleteDomainButton id={domain.id} domain={domain.domain} />
        </div>
      </header>

      {quality ? (
        <Card
          className={
            'mb-6 ' +
            (quality.ready
              ? 'border-emerald-200 bg-emerald-50'
              : quality.errorCount > 0
                ? 'border-rose-200 bg-rose-50'
                : 'border-amber-200 bg-amber-50')
          }
        >
          <CardContent>
            <div className="flex items-start gap-3">
              {quality.ready ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : quality.errorCount > 0 ? (
                <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              )}
              <div className="flex-1">
                <p className="font-medium text-secondary-900">
                  {quality.ready
                    ? 'Ready to send'
                    : quality.errorCount > 0
                      ? `${quality.errorCount} blocking issue${quality.errorCount === 1 ? '' : 's'}`
                      : `${quality.warningCount} warning${quality.warningCount === 1 ? '' : 's'}`}
                </p>
                <p className="mt-0.5 text-sm text-secondary-600">
                  {quality.checks.length} checks total · {quality.errorCount} error ·{' '}
                  {quality.warningCount} warning
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AuthTile label="SPF" status={domain.spfStatus} />
        <AuthTile label="DKIM" status={domain.dkimStatus} />
        <AuthTile label="DMARC" status={domain.dmarcStatus} />
        <AuthTile label="Return-Path" status={domain.returnPathStatus} />
      </section>

      {quality && quality.checks.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Authentication checks</CardTitle>
            <CardDescription>
              Mandatory checks must pass before high-volume sends. Warnings are deliverability
              boosters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {quality.checks.map((check) => {
                const Icon =
                  check.status === 'pass'
                    ? CheckCircle2
                    : check.severity === 'error'
                      ? XCircle
                      : check.severity === 'warning'
                        ? AlertTriangle
                        : Info;
                const tone =
                  check.status === 'pass'
                    ? 'text-emerald-600'
                    : check.severity === 'error'
                      ? 'text-rose-600'
                      : 'text-amber-600';
                return (
                  <li
                    key={check.name}
                    className="flex items-start gap-3 rounded-md border border-secondary-200 bg-white p-3"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-secondary-900">{check.label}</p>
                        <Badge
                          variant={
                            check.status === 'pass'
                              ? 'success'
                              : check.severity === 'error'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {check.status}
                        </Badge>
                      </div>
                      {check.detail ? (
                        <p className="mt-1 text-xs text-secondary-500">{check.detail}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {domain.dnsRecords && domain.dnsRecords.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>DNS records to add</CardTitle>
            <CardDescription>
              Add these records at your DNS provider. They typically propagate within 5–60 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-secondary-200">
              <table className="w-full text-sm">
                <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Host</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-3 py-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {domain.dnsRecords.map((rec, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs uppercase text-secondary-700">
                        {rec.type}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary-900">{rec.host}</td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary-600 break-all">
                        {rec.value}
                      </td>
                      <td className="px-3 py-2 text-xs text-secondary-500">{rec.purpose ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AuthTile({ label, status }: { label: string; status?: string | null }) {
  const Icon = iconFor(status);
  const tone = colorFor(status);
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        <p className="text-sm font-medium text-secondary-900">{status ?? 'pending'}</p>
      </div>
    </div>
  );
}
