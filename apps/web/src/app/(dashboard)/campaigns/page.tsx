import Link from 'next/link';
import { Plus, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  subject: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  totalSent: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  createdAt: string;
}

const STATUS_TONE: Record<
  Campaign['status'],
  'default' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  draft: 'default',
  scheduled: 'primary',
  sending: 'warning',
  sent: 'success',
  paused: 'warning',
  cancelled: 'danger',
};

const STATUS_OPTIONS = [
  '',
  'draft',
  'scheduled',
  'sending',
  'sent',
  'paused',
  'cancelled',
] as const;

export const dynamic = 'force-dynamic';

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const qs = params.status ? `?status=${encodeURIComponent(params.status)}` : '';
  const campaigns = await apiFetch<Campaign[]>(`/api/v1/campaigns${qs}`, { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Campaigns</h1>
          <p className="mt-1 text-sm text-secondary-500">
            One-off broadcasts. For recurring sequences see Workflows.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </Link>
      </header>

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => {
          const active = (params.status ?? '') === s;
          return (
            <Link
              key={s || 'all'}
              href={s ? `/campaigns?status=${s}` : '/campaigns'}
              className={
                'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                (active
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-secondary-600 ring-1 ring-secondary-200 hover:bg-secondary-50')
              }
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </Link>
          );
        })}
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Send className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No campaigns yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create a draft to start sending broadcasts.
            </p>
            <Link
              href="/campaigns/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              New campaign
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
          <table className="w-full">
            <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Open rate</th>
                <th className="px-4 py-3 font-medium">Click rate</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 text-sm">
              {campaigns.map((c) => {
                const openRate =
                  c.totalDelivered > 0 ? ((c.totalOpens / c.totalDelivered) * 100).toFixed(1) : '—';
                const clickRate =
                  c.totalDelivered > 0
                    ? ((c.totalClicks / c.totalDelivered) * 100).toFixed(1)
                    : '—';
                const when = c.sentAt
                  ? new Date(c.sentAt).toLocaleString('cs-CZ')
                  : c.scheduledAt
                    ? `Scheduled ${new Date(c.scheduledAt).toLocaleString('cs-CZ')}`
                    : new Date(c.createdAt).toLocaleString('cs-CZ');
                return (
                  <tr key={c.id} className="hover:bg-secondary-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-secondary-900 hover:text-primary-700"
                      >
                        {c.name}
                      </Link>
                      {c.subject ? (
                        <p className="mt-0.5 truncate text-xs text-secondary-500">{c.subject}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-secondary-600">{c.type}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-secondary-700">
                      {c.totalSent.toLocaleString('cs-CZ')}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-secondary-700">
                      {openRate}
                      {openRate !== '—' ? '%' : ''}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-secondary-700">
                      {clickRate}
                      {clickRate !== '—' ? '%' : ''}
                    </td>
                    <td className="px-4 py-3 text-secondary-500">{when}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
