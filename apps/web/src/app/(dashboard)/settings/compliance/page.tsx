import Link from 'next/link';
import { ArrowLeft, Shield, CheckCircle2, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { SeedControlsButton } from './seed-controls-button';
import { RunAccessReviewButton } from './run-access-review-button';

interface Control {
  id: string;
  category: string;
  name: string;
  implemented: boolean;
  ownerUserId: string | null;
  evidenceUrl: string | null;
  nextReviewAt: string | null;
}

interface RetentionPolicy {
  id: string;
  resource: string;
  retentionDays: number;
  updatedAt: string;
}

interface AccessReview {
  id: string;
  performedByUserId: string;
  findings: string | null;
  createdAt: string;
}

interface Report {
  totalControls: number;
  implementedControls: number;
  pendingControls: number;
  retentionResourcesCount: number;
  lastAccessReview: string | null;
}

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const [controls, retention, reviews, report] = await Promise.all([
    apiFetch<Control[]>('/api/v1/compliance/controls', { fallback: [] }),
    apiFetch<RetentionPolicy[]>('/api/v1/compliance/retention-policies', { fallback: [] }),
    apiFetch<AccessReview[]>('/api/v1/compliance/access-reviews', { fallback: [] }),
    apiFetch<Report | null>('/api/v1/compliance/report', { fallback: null }),
  ]);

  const grouped = new Map<string, Control[]>();
  for (const c of controls) {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Compliance</h1>
          <p className="mt-1 text-sm text-secondary-500">
            GDPR Art. 28 / 32 / 17 / 20 controls, retention policies, and access reviews.
          </p>
        </div>
        {controls.length === 0 ? <SeedControlsButton /> : null}
      </header>

      {/* Report tiles */}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Controls implemented"
          value={`${report?.implementedControls ?? 0}/${report?.totalControls ?? controls.length}`}
          tone="good"
        />
        <Kpi
          label="Pending controls"
          value={String(report?.pendingControls ?? 0)}
          tone={(report?.pendingControls ?? 0) > 0 ? 'warn' : 'good'}
        />
        <Kpi label="Retention policies" value={String(retention.length)} />
        <Kpi
          label="Last access review"
          value={
            report?.lastAccessReview
              ? new Date(report.lastAccessReview).toLocaleDateString('cs-CZ')
              : '—'
          }
          tone={report?.lastAccessReview ? 'good' : 'warn'}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Legal-team-reviewed templates</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="/docs/legal/DPA_TEMPLATE.md"
                  className="inline-flex items-center gap-2 text-primary-700 hover:text-primary-900"
                >
                  <FileText className="h-4 w-4" />
                  Data Processing Agreement
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="/docs/legal/SUB_PROCESSORS.md"
                  className="inline-flex items-center gap-2 text-primary-700 hover:text-primary-900"
                >
                  <FileText className="h-4 w-4" />
                  Sub-processors list
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Retention */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Retention policies</CardTitle>
            <CardDescription>
              How long each resource is kept before automatic deletion
            </CardDescription>
          </CardHeader>
          <CardContent>
            {retention.length === 0 ? (
              <p className="text-sm text-secondary-500">
                No policies set — defaults apply. Add a policy to enforce GDPR Art. 5(1)(e) storage
                limitation.
              </p>
            ) : (
              <ul className="divide-y divide-secondary-100 text-sm">
                {retention.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span className="font-mono text-xs text-secondary-700">{p.resource}</span>
                    <span className="tabular-nums text-secondary-900">{p.retentionDays} days</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Access reviews */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Access reviews</CardTitle>
            <CardDescription>
              Periodic confirmations that workspace permissions match real-world needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <RunAccessReviewButton />
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-secondary-500">No reviews recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {reviews.slice(0, 10).map((r) => (
                  <li key={r.id} className="rounded-md border border-secondary-200 bg-white p-3">
                    <p className="text-xs text-secondary-500">
                      {new Date(r.createdAt).toLocaleString('cs-CZ')}
                    </p>
                    {r.findings ? (
                      <p className="mt-1 text-secondary-700">{r.findings}</p>
                    ) : (
                      <p className="mt-1 text-secondary-400">No findings recorded.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Controls */}
        {controls.length > 0 ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>SOC2-style technical and organizational measures</CardDescription>
            </CardHeader>
            <CardContent>
              {Array.from(grouped.entries()).map(([category, items]) => (
                <div key={category} className="mb-6 last:mb-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-secondary-500">
                    {category}
                  </p>
                  <ul className="space-y-2">
                    {items.map((c) => {
                      const Icon = c.implemented ? CheckCircle2 : AlertCircle;
                      return (
                        <li
                          key={c.id}
                          className="flex items-start gap-3 rounded-md border border-secondary-200 bg-white p-3"
                        >
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${c.implemented ? 'text-emerald-600' : 'text-amber-600'}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-secondary-900">{c.name}</p>
                              <Badge variant={c.implemented ? 'success' : 'warning'}>
                                {c.implemented ? 'Implemented' : 'Pending'}
                              </Badge>
                            </div>
                            {c.evidenceUrl ? (
                              <a
                                href={c.evidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-900"
                              >
                                Evidence <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                            {c.nextReviewAt ? (
                              <p className="mt-1 text-xs text-secondary-500">
                                Next review {new Date(c.nextReviewAt).toLocaleDateString('cs-CZ')}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-3">
            <CardContent className="py-12 text-center">
              <Shield className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-secondary-900">No controls seeded yet</p>
              <p className="mt-1 text-sm text-secondary-500">
                Click "Seed default controls" above to load the standard SOC2-style baseline.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'bad'
          ? 'text-rose-600'
          : 'text-secondary-900';
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
