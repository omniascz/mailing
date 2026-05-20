import Link from 'next/link';
import { Workflow as WorkflowIcon, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  triggerType: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TONE: Record<Workflow['status'], 'default' | 'success' | 'warning' | 'primary'> = {
  draft: 'default',
  active: 'success',
  paused: 'warning',
  archived: 'primary',
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  list_subscribe: 'List subscribe',
  tag_added: 'Tag added',
  api_event: 'Custom event',
  form_submit: 'Form submit',
  purchase_event: 'Purchase',
  date_field: 'Date field',
  name_day_today: 'CZ jmeniny',
  lifecycle_stage_changed: 'Lifecycle change',
  n_days_before_holiday: 'Before holiday',
  loyalty_points_earned: 'Loyalty points',
  loyalty_tier_up: 'Tier upgrade',
  loyalty_reward_redeemed: 'Reward redeemed',
};

const STATUS_OPTIONS = ['', 'draft', 'active', 'paused', 'archived'] as const;

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const qs = params.status ? `?status=${encodeURIComponent(params.status)}` : '';
  const workflows = await apiFetch<Workflow[]>(`/api/v1/workflows${qs}`, { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Workflows</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Automated journeys triggered by contact behaviour, time, or custom events.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/workflows/map"
            className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
          >
            Map
          </Link>
          <Link
            href="/workflows/gallery"
            className="inline-flex items-center gap-2 rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
          >
            <Sparkles className="h-4 w-4" />
            Browse templates
          </Link>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            New workflow
          </Link>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => {
          const active = (params.status ?? '') === s;
          return (
            <Link
              key={s || 'all'}
              href={s ? `/workflows?status=${s}` : '/workflows'}
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

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WorkflowIcon className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No workflows yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Start from a template or build one from scratch.
            </p>
            <Link
              href="/workflows/gallery"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Sparkles className="h-4 w-4" />
              Browse templates
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
          <table className="w-full">
            <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Runs</th>
                <th className="px-4 py-3 text-right font-medium">Completed</th>
                <th className="px-4 py-3 text-right font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 text-sm">
              {workflows.map((w) => (
                <tr key={w.id} className="hover:bg-secondary-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/workflows/${w.id}`}
                      className="font-medium text-secondary-900 hover:text-primary-700"
                    >
                      {w.name}
                    </Link>
                    {w.description ? (
                      <p className="mt-0.5 truncate text-xs text-secondary-500">{w.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-secondary-600">
                    {TRIGGER_LABELS[w.triggerType] ?? w.triggerType}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_TONE[w.status]}>{w.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-secondary-700">
                    {w.totalRuns.toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {w.completedRuns.toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-700">
                    {w.failedRuns.toLocaleString('cs-CZ')}
                  </td>
                  <td className="px-4 py-3 text-secondary-500">
                    {new Date(w.updatedAt).toLocaleString('cs-CZ')}
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
