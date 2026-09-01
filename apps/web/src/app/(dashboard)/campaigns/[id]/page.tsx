import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Inbox } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { getCapabilities } from '@/lib/capabilities.server';
import { CampaignActions } from './campaign-actions';
import { CloneCampaignButton } from './clone-campaign-button';
import { PollResultsCard, type PollResult } from './poll-results-card';
import { AbResultCard, type AbConfigLite, type AbResult } from './ab-result-card';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Campaign {
  id: string;
  name: string;
  type: string;
  status:
    | 'draft'
    | 'scheduled'
    | 'queueing'
    | 'sending'
    | 'sent'
    | 'failed'
    | 'paused'
    | 'cancelled';
  pausedReason: string | null;
  subject: string | null;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  totalSent: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  totalBounces: number;
  totalUnsubscribes: number;
  totalComplaints: number;
  parentCampaignId: string | null;
  content: Record<string, unknown> | null;
  listId: string | null;
  segmentId: string | null;
  excludeSegmentId: string | null;
  abConfig: AbConfigLite | null;
  createdAt: string;
}

interface DeviceStats {
  desktop: number;
  mobile: number;
  tablet: number;
  unknown: number;
}
interface ClientStat {
  client: string;
  label: string;
  opens: number;
  percentage: number;
}
interface GeoStatRow {
  country: string;
  opens: number;
  clicks: number;
}

const STATUS_TONE: Record<
  Campaign['status'],
  'default' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  draft: 'default',
  scheduled: 'primary',
  queueing: 'primary',
  sending: 'warning',
  sent: 'success',
  failed: 'danger',
  paused: 'warning',
  cancelled: 'danger',
};

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await apiFetch<Campaign | null>(`/api/v1/campaigns/${id}`, { fallback: null });
  if (!campaign) notFound();

  const delivered = campaign.totalDelivered;
  const rate = (n: number) => (delivered > 0 ? `${((n / delivered) * 100).toFixed(1)}%` : '—');
  const isSent = campaign.status === 'sent' || campaign.totalSent > 0;

  const { geoAnalytics } = await getCapabilities();

  // Both are cheap and both answer "there is nothing here" by themselves —
  // pollResultsForCampaign returns [] when the campaign has no poll block, and
  // ab-result returns null until a winner is picked. Neither is gated on
  // `isSent`: a draft that carries a poll should show its questions at zero,
  // and an A/B test that has not been decided yet is exactly what an operator
  // is looking at the page to find out.
  const [polls, abResult] = await Promise.all([
    apiFetch<PollResult[]>(`/api/v1/campaigns/${id}/poll-results`, { fallback: [] }),
    apiFetch<AbResult | null>(`/api/v1/campaigns/${id}/ab-result`, { fallback: null }),
  ]);

  const emptyDevices: DeviceStats = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
  const [devices, clients, geo]: [DeviceStats, ClientStat[], GeoStatRow[]] = isSent
    ? await Promise.all([
        apiFetch<DeviceStats>(`/api/v1/campaigns/${id}/stats/devices`, { fallback: emptyDevices }),
        apiFetch<ClientStat[]>(`/api/v1/campaigns/${id}/stats/clients`, { fallback: [] }),
        apiFetch<GeoStatRow[]>(`/api/v1/campaigns/${id}/stats/geo`, { fallback: [] }),
      ])
    : [emptyDevices, [], []];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/campaigns"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-secondary-900">{campaign.name}</h1>
            <Badge variant={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
            {campaign.parentCampaignId ? <Badge variant="primary">Resend</Badge> : null}
          </div>
          {campaign.subject ? (
            <p className="mt-1 text-sm text-secondary-600">Subject — {campaign.subject}</p>
          ) : null}
          <p className="mt-1 text-xs text-secondary-500">
            Channel: {campaign.type} · Created{' '}
            {new Date(campaign.createdAt).toLocaleString('cs-CZ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
            >
              Edit content
            </Link>
            {isSent ? (
              <>
                <a
                  href={`${API_BASE}/api/v1/campaigns/${campaign.id}/report.csv`}
                  className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
                >
                  Report CSV
                </a>
                <a
                  href={`${API_BASE}/api/v1/campaigns/${campaign.id}/report.pdf`}
                  className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
                >
                  Report PDF
                </a>
              </>
            ) : null}
            <CloneCampaignButton campaign={campaign} />
          </div>
          <CampaignActions campaign={campaign} />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Sent" value={campaign.totalSent.toLocaleString('cs-CZ')} />
        <Kpi label="Delivered" value={campaign.totalDelivered.toLocaleString('cs-CZ')} />
        <Kpi label="Open rate" value={rate(campaign.totalOpens)} tone="good" />
        <Kpi label="Click rate" value={rate(campaign.totalClicks)} tone="good" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Engagement breakdown</CardTitle>
            <CardDescription>
              {isSent ? 'How this send performed' : 'Stats will appear once the campaign is sent.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <StatRow
                label="Opens"
                value={campaign.totalOpens.toLocaleString('cs-CZ')}
                rate={rate(campaign.totalOpens)}
              />
              <StatRow
                label="Clicks"
                value={campaign.totalClicks.toLocaleString('cs-CZ')}
                rate={rate(campaign.totalClicks)}
              />
              <StatRow
                label="Bounces"
                value={campaign.totalBounces.toLocaleString('cs-CZ')}
                rate={rate(campaign.totalBounces)}
                tone="bad"
              />
              <StatRow
                label="Unsubscribes"
                value={campaign.totalUnsubscribes.toLocaleString('cs-CZ')}
                rate={rate(campaign.totalUnsubscribes)}
                tone="bad"
              />
              <StatRow
                label="Complaints"
                value={campaign.totalComplaints.toLocaleString('cs-CZ')}
                rate={rate(campaign.totalComplaints)}
                tone="bad"
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sender + Scheduling</CardTitle>
            <CardDescription>From / Reply-To / Schedule details</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="From name" value={campaign.fromName} />
              <Row label="From email" value={campaign.fromEmail} />
              <Row label="Reply-To" value={campaign.replyTo} />
              <Row
                label="Scheduled"
                value={
                  campaign.scheduledAt
                    ? new Date(campaign.scheduledAt).toLocaleString('cs-CZ')
                    : null
                }
                icon={<Calendar className="h-3.5 w-3.5 text-secondary-400" />}
              />
              <Row
                label="Sent"
                value={campaign.sentAt ? new Date(campaign.sentAt).toLocaleString('cs-CZ') : null}
                icon={<Inbox className="h-3.5 w-3.5 text-secondary-400" />}
              />
            </dl>
          </CardContent>
        </Card>
      </section>

      {isSent ? (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Devices</CardTitle>
              <CardDescription>Opens by form-factor</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <BreakdownRow label="Desktop" value={devices.desktop} />
                <BreakdownRow label="Mobile" value={devices.mobile} />
                <BreakdownRow label="Tablet" value={devices.tablet} />
                <BreakdownRow label="Unknown" value={devices.unknown} muted />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email clients</CardTitle>
              <CardDescription>Opens by client</CardDescription>
            </CardHeader>
            <CardContent>
              {clients.length === 0 ? (
                <p className="text-sm text-secondary-500">No client data yet.</p>
              ) : (
                <dl className="space-y-2 text-sm">
                  {clients.slice(0, 8).map((c) => (
                    <BreakdownRow
                      key={c.client}
                      label={c.label}
                      value={c.opens}
                      suffix={`${c.percentage}%`}
                      muted={c.client === 'unknown'}
                    />
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          {/*
            Rendered only where GeoIP is configured. lib/geo.ts resolves nothing
            without GEOIP_API_URL, so this card was permanently empty and said so
            in its own empty state — a panel whose only content is an apology for
            having none. Setting the variable brings it back.
          */}
          {geoAnalytics ? (
            <Card>
              <CardHeader>
                <CardTitle>Top countries</CardTitle>
                <CardDescription>Opens / clicks by country</CardDescription>
              </CardHeader>
              <CardContent>
                {geo.length === 0 ? (
                  <p className="text-sm text-secondary-500">No opens with a known location yet.</p>
                ) : (
                  <dl className="space-y-2 text-sm">
                    {geo.slice(0, 8).map((g) => (
                      <BreakdownRow
                        key={g.country}
                        label={g.country}
                        value={g.opens}
                        suffix={`${g.clicks} clicks`}
                      />
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}

      <AbResultCard abConfig={campaign.abConfig} result={abResult} />
      <PollResultsCard results={polls} />
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  suffix,
  muted,
}: {
  label: string;
  value: number;
  suffix?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? 'text-secondary-400' : 'text-secondary-600'}>{label}</dt>
      <dd className="text-right">
        <span className="font-medium tabular-nums text-secondary-900">
          {value.toLocaleString('cs-CZ')}
        </span>
        {suffix ? (
          <span className="ml-2 text-xs tabular-nums text-secondary-500">{suffix}</span>
        ) : null}
      </dd>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-secondary-900';
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatRow({
  label,
  value,
  rate,
  tone,
}: {
  label: string;
  value: string;
  rate: string;
  tone?: 'bad';
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-secondary-600">{label}</dt>
      <dd className="text-right">
        <span className="font-medium tabular-nums text-secondary-900">{value}</span>
        <span
          className={`ml-2 text-xs tabular-nums ${tone === 'bad' ? 'text-rose-600' : 'text-secondary-500'}`}
        >
          {rate}
        </span>
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-secondary-500">
        {icon}
        {label}
      </dt>
      <dd className="truncate text-secondary-900">
        {value || <span className="text-secondary-400">—</span>}
      </dd>
    </div>
  );
}
