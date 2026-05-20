import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { CancelRunButton } from './cancel-run-button';

interface WorkflowRun {
  id: string;
  workflowId: string;
  contactId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  currentNodeId: string | null;
  splitBranch: string | null;
  converted: boolean;
  convertedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nextExecutionAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface RunsResponse {
  data: WorkflowRun[];
  cursor: string | null;
  hasMore: boolean;
}

interface Workflow {
  id: string;
  name: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
}

const STATUS_TONE: Record<
  WorkflowRun['status'],
  'default' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  pending: 'default',
  running: 'primary',
  paused: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'default',
};

export const dynamic = 'force-dynamic';

export default async function WorkflowRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const [wf, runsRes] = await Promise.all([
    apiFetch<Workflow | null>(`/api/v1/workflows/${id}`, { fallback: null }),
    apiFetch<RunsResponse | WorkflowRun[]>(`/api/v1/workflows/${id}/runs?${qs.toString()}`, {
      fallback: { data: [], cursor: null, hasMore: false },
    }),
  ]);
  if (!wf) notFound();

  const runs: WorkflowRun[] = Array.isArray(runsRes) ? runsRes : runsRes.data;
  const hasMore = Array.isArray(runsRes) ? false : runsRes.hasMore;
  const nextCursor = Array.isArray(runsRes) ? null : runsRes.cursor;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/workflows/${wf.id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to workflow
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Runs — {wf.name}</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Per-contact run history. Use this to debug stuck runs or see exactly where a contact
          dropped off.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total runs" value={wf.totalRuns.toLocaleString('cs-CZ')} />
        <Kpi label="Completed" value={wf.completedRuns.toLocaleString('cs-CZ')} tone="good" />
        <Kpi
          label="Failed"
          value={wf.failedRuns.toLocaleString('cs-CZ')}
          tone={wf.failedRuns > 0 ? 'bad' : undefined}
        />
        <Kpi
          label="In flight"
          value={runs
            .filter(
              (r) => r.status === 'running' || r.status === 'pending' || r.status === 'paused',
            )
            .length.toLocaleString('cs-CZ')}
        />
      </section>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No runs yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Runs appear once a contact triggers the workflow.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
            <table className="w-full">
              <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Current step</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Converted</th>
                  <th className="px-4 py-3 font-medium">Next run</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100 text-sm">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary-50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-secondary-500">
                      {r.startedAt
                        ? new Date(r.startedAt).toLocaleString('cs-CZ')
                        : new Date(r.createdAt).toLocaleString('cs-CZ')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_TONE[r.status]}>{r.status}</Badge>
                      {r.errorMessage ? (
                        <p
                          className="mt-1 max-w-xs truncate text-xs text-rose-600"
                          title={r.errorMessage}
                        >
                          {r.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {r.contactId ? (
                        <Link
                          href={`/contacts/${r.contactId}`}
                          className="font-mono text-xs text-primary-700 hover:text-primary-900"
                        >
                          {r.contactId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-secondary-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary-700">
                      {r.currentNodeId ?? <span className="text-secondary-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.splitBranch ? (
                        <Badge variant="default">{r.splitBranch}</Badge>
                      ) : (
                        <span className="text-secondary-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.converted ? (
                        <Badge variant="success">
                          {r.convertedAt
                            ? new Date(r.convertedAt).toLocaleDateString('cs-CZ')
                            : 'yes'}
                        </Badge>
                      ) : (
                        <span className="text-secondary-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-secondary-500">
                      {r.nextExecutionAt
                        ? new Date(r.nextExecutionAt).toLocaleString('cs-CZ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <Link
                          href={`/workflows/${wf.id}/runs/${r.id}`}
                          className="text-xs font-medium text-primary-700 hover:text-primary-900"
                        >
                          Details →
                        </Link>
                        {r.status === 'running' ||
                        r.status === 'pending' ||
                        r.status === 'paused' ? (
                          <CancelRunButton workflowId={wf.id} runId={r.id} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Link
                href={`/workflows/${wf.id}/runs?cursor=${nextCursor}`}
                className="rounded-md border border-secondary-300 bg-white px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-50"
              >
                Load older runs
              </Link>
            </div>
          ) : null}
        </>
      )}
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
