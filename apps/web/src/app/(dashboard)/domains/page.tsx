import Link from 'next/link';
import { Globe, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { NewDomainButton } from './new-domain-button';

interface Domain {
  id: string;
  domain: string;
  status: string;
  spfStatus?: string | null;
  dkimStatus?: string | null;
  dmarcStatus?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

function summaryTone(d: Domain): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'default';
  icon: typeof Globe;
} {
  const checks = [d.spfStatus, d.dkimStatus, d.dmarcStatus];
  const allGreen = checks.every((s) => s === 'pass' || s === 'valid' || s === 'authenticated');
  const anyFail = checks.some((s) => s === 'fail' || s === 'invalid');
  if (allGreen) return { label: 'Authenticated', tone: 'success', icon: CheckCircle2 };
  if (anyFail) return { label: 'Failing checks', tone: 'danger', icon: XCircle };
  return { label: 'Needs setup', tone: 'warning', icon: AlertTriangle };
}

export const dynamic = 'force-dynamic';

export default async function DomainsPage() {
  const domains = await apiFetch<Domain[]>('/api/v1/domains', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Sending domains</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Add and verify domains so your campaigns send from your own brand instead of a generic
            envelope.
          </p>
        </div>
        <NewDomainButton />
      </header>

      {domains.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No domains yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Add your first sending domain — you'll be guided through SPF, DKIM, DMARC setup.
            </p>
            <div className="mt-4 inline-block">
              <NewDomainButton />
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {domains.map((d) => {
            const sum = summaryTone(d);
            const Icon = sum.icon;
            return (
              <li key={d.id}>
                <Link href={`/domains/${d.id}`}>
                  <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                    <CardContent className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon
                          className={
                            'h-5 w-5 shrink-0 ' +
                            (sum.tone === 'success'
                              ? 'text-emerald-600'
                              : sum.tone === 'danger'
                                ? 'text-rose-600'
                                : 'text-amber-600')
                          }
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-secondary-900">{d.domain}</p>
                          <p className="mt-0.5 text-xs text-secondary-500">
                            Added {new Date(d.createdAt).toLocaleDateString('cs-CZ')}
                            {d.verifiedAt
                              ? ` · Verified ${new Date(d.verifiedAt).toLocaleDateString('cs-CZ')}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Pill label="SPF" status={d.spfStatus} />
                        <Pill label="DKIM" status={d.dkimStatus} />
                        <Pill label="DMARC" status={d.dmarcStatus} />
                        <Badge variant={sum.tone}>{sum.label}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Pill({ label, status }: { label: string; status?: string | null }) {
  const ok = status === 'pass' || status === 'valid' || status === 'authenticated';
  const fail = status === 'fail' || status === 'invalid';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ' +
        (ok
          ? 'bg-emerald-50 text-emerald-700'
          : fail
            ? 'bg-rose-50 text-rose-700'
            : 'bg-secondary-100 text-secondary-500')
      }
    >
      {label}
    </span>
  );
}
