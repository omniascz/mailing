import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { BarChart, type BarDatum } from '@/components/dashboard/bar-chart';
import { apiFetch } from '@/lib/api';

// RFM cohort label + tone — visual hierarchy mirrors the lifecycle map
// so "champions" doesn't look the same as "lost".
const RFM_LABELS: Record<string, { label: string; tone: BarDatum['tone'] }> = {
  champions: { label: 'Champions', tone: 'good' },
  loyal: { label: 'Loyal', tone: 'good' },
  potential_loyalists: { label: 'Potential loyalists', tone: 'good' },
  recent_customers: { label: 'Recent customers', tone: 'neutral' },
  promising: { label: 'Promising', tone: 'neutral' },
  needs_attention: { label: 'Needs attention', tone: 'warn' },
  about_to_sleep: { label: 'About to sleep', tone: 'warn' },
  at_risk: { label: 'At risk', tone: 'bad' },
  cant_lose: { label: "Can't lose", tone: 'bad' },
  hibernating: { label: 'Hibernating', tone: 'bad' },
  lost: { label: 'Lost', tone: 'bad' },
};

const CLV_ORDER = ['1000+', '250-1000', '50-250', '1-50', '0'];

interface RfmRow {
  segment: string;
  count: number;
}
interface DistributionResponse {
  clv: Array<{ bucket: string; count: number }>;
  churn: Array<{ bucket: string; count: number }>;
}
interface PredictiveSummary {
  totalContacts: number;
  avgClv: number;
  highLikelihoodCount: number;
  atRiskCount: number;
}

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const [rfm, dist, summary] = await Promise.all([
    apiFetch<RfmRow[]>('/api/v1/rfm/distribution', { fallback: [] }),
    apiFetch<DistributionResponse>('/api/v1/predictive/distribution', {
      fallback: { clv: [], churn: [] },
    }),
    apiFetch<PredictiveSummary>('/api/v1/predictive/summary', {
      fallback: { totalContacts: 0, avgClv: 0, highLikelihoodCount: 0, atRiskCount: 0 },
    }),
  ]);

  const rfmData: BarDatum[] = rfm
    .map((r) => ({
      label: RFM_LABELS[r.segment]?.label ?? r.segment,
      value: r.count,
      tone: RFM_LABELS[r.segment]?.tone ?? 'neutral',
    }))
    .sort((a, b) => b.value - a.value);

  const clvData: BarDatum[] = CLV_ORDER.map((bucket) => ({
    label: bucket === '0' ? 'No orders' : `€${bucket}`,
    value: dist.clv.find((c) => c.bucket === bucket)?.count ?? 0,
    tone: (bucket === '1000+'
      ? 'good'
      : bucket === '0'
        ? 'neutral'
        : 'neutral') as BarDatum['tone'],
  }));

  const churnData: BarDatum[] = [
    {
      label: 'Low risk',
      value: dist.churn.find((c) => c.bucket === 'low')?.count ?? 0,
      tone: 'good',
    },
    {
      label: 'Medium risk',
      value: dist.churn.find((c) => c.bucket === 'medium')?.count ?? 0,
      tone: 'warn',
    },
    {
      label: 'High risk',
      value: dist.churn.find((c) => c.bucket === 'high')?.count ?? 0,
      tone: 'bad',
    },
    {
      label: 'Unscored',
      value: dist.churn.find((c) => c.bucket === 'unknown')?.count ?? 0,
      tone: 'neutral',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-secondary-900">Insights</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Where your audience stands today — refreshed nightly.
        </p>
      </header>

      {/* KPI tiles */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Scored contacts" value={summary.totalContacts.toLocaleString('cs-CZ')} />
        <Kpi label="Average CLV" value={`€${summary.avgClv.toFixed(0)}`} />
        <Kpi
          label="High purchase likelihood"
          value={summary.highLikelihoodCount.toLocaleString('cs-CZ')}
          tone="good"
        />
        <Kpi
          label="High churn risk"
          value={summary.atRiskCount.toLocaleString('cs-CZ')}
          tone="bad"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>RFM cohorts</CardTitle>
            <CardDescription>Customer lifecycle distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={rfmData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Predicted CLV</CardTitle>
            <CardDescription>Contacts grouped by 2-year forecast value (€)</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={clvData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Churn risk</CardTitle>
            <CardDescription>
              Audience health — high-risk contacts are candidates for win-back automation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={churnData} />
          </CardContent>
        </Card>
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
  tone?: 'good' | 'bad' | 'neutral';
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-secondary-900';
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
