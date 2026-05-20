import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Phone,
  Clock,
  GitBranch,
  Webhook,
  Tag as TagIcon,
  ListPlus,
  ListMinus,
  Bell,
  UserPlus,
  MapPin,
  Code2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { CancelRunButton } from '../cancel-run-button';

interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface Workflow {
  id: string;
  name: string;
  status: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  contactId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  currentNodeId: string | null;
  data: Record<string, unknown>;
  splitBranch: string | null;
  converted: boolean;
  convertedAt: string | null;
  nextExecutionAt: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
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

const NODE_ICONS: Record<string, typeof Mail> = {
  trigger: GitBranch,
  send_email: Mail,
  send_sms: MessageSquare,
  send_whatsapp: MessageSquare,
  send_push: Bell,
  make_voice_call: Phone,
  wait: Clock,
  condition: GitBranch,
  add_tag: TagIcon,
  remove_tag: TagIcon,
  move_to_list: ListPlus,
  remove_from_list: ListMinus,
  send_webhook: Webhook,
  assign_task: UserPlus,
};

/**
 * Linearize from the trigger by walking outgoing edges. Same heuristic as
 * the workflow detail page — branches collapse into orphans which we
 * surface separately so the user can still see they exist.
 */
function linearize(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    const arr = outgoing.get(e.source) ?? [];
    arr.push(e);
    outgoing.set(e.source, arr);
  }
  const start = nodes.find((n) => n.type === 'trigger') ?? nodes[0];
  if (!start) return nodes;
  const result: WorkflowNode[] = [];
  const seen = new Set<string>();
  const stack: string[] = [start.id];
  while (stack.length) {
    const id = stack.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) result.push(node);
    for (const e of outgoing.get(id) ?? []) stack.push(e.target);
  }
  for (const n of nodes) if (!seen.has(n.id)) result.push(n);
  return result;
}

export const dynamic = 'force-dynamic';

export default async function WorkflowRunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const [wf, run] = await Promise.all([
    apiFetch<Workflow | null>(`/api/v1/workflows/${id}`, { fallback: null }),
    apiFetch<WorkflowRun | null>(`/api/v1/workflows/${id}/runs/${runId}`, { fallback: null }),
  ]);
  if (!wf || !run) notFound();

  const steps = linearize(wf.nodes, wf.edges);
  const currentIdx = steps.findIndex((s) => s.id === run.currentNodeId);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/workflows/${wf.id}/runs`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to run history
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-secondary-900">Run · {wf.name}</h1>
            <Badge variant={STATUS_TONE[run.status]}>{run.status}</Badge>
            {run.converted ? <Badge variant="success">converted</Badge> : null}
            {run.splitBranch ? <Badge variant="default">split: {run.splitBranch}</Badge> : null}
          </div>
          <p className="mt-1 font-mono text-xs text-secondary-500">{run.id}</p>
        </div>
        {run.status === 'running' || run.status === 'pending' || run.status === 'paused' ? (
          <CancelRunButton workflowId={wf.id} runId={run.id} />
        ) : null}
      </header>

      {run.errorMessage ? (
        <Card className="mb-6 border-rose-200 bg-rose-50">
          <CardContent>
            <p className="text-sm font-medium text-rose-900">Run errored</p>
            <pre className="mt-1 whitespace-pre-wrap text-xs text-rose-800">{run.errorMessage}</pre>
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-secondary-400" />
              Run metadata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row
                label="Status"
                value={<Badge variant={STATUS_TONE[run.status]}>{run.status}</Badge>}
              />
              <Row
                label="Contact"
                value={
                  run.contactId ? (
                    <Link
                      href={`/contacts/${run.contactId}`}
                      className="font-mono text-xs text-primary-700 hover:text-primary-900"
                    >
                      {run.contactId}
                    </Link>
                  ) : null
                }
              />
              <Row
                label="Current step"
                value={
                  run.currentNodeId ? (
                    <code className="font-mono text-xs">{run.currentNodeId}</code>
                  ) : null
                }
              />
              <Row
                label="Started"
                value={
                  run.startedAt
                    ? new Date(run.startedAt).toLocaleString('cs-CZ')
                    : new Date(run.createdAt).toLocaleString('cs-CZ')
                }
              />
              <Row
                label="Completed"
                value={run.completedAt ? new Date(run.completedAt).toLocaleString('cs-CZ') : null}
              />
              <Row
                label="Next execution"
                value={
                  run.nextExecutionAt ? new Date(run.nextExecutionAt).toLocaleString('cs-CZ') : null
                }
              />
              {run.converted && run.convertedAt ? (
                <Row label="Converted" value={new Date(run.convertedAt).toLocaleString('cs-CZ')} />
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-secondary-400" />
              Run data
            </CardTitle>
            <CardDescription>
              Variables accumulated by the run — merge tag fills, condition outputs, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(run.data ?? {}).length === 0 ? (
              <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-center text-xs text-secondary-500">
                No accumulated data yet.
              </p>
            ) : (
              <pre className="max-h-64 overflow-auto rounded-md bg-secondary-900 p-3 text-xs leading-relaxed text-secondary-100">
                {JSON.stringify(run.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Execution path</CardTitle>
          <CardDescription>
            Trigger → current step → end. Steps before the current marker have already run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {steps.map((node, idx) => {
              const Icon = NODE_ICONS[node.type] ?? GitBranch;
              const isCurrent = node.id === run.currentNodeId;
              const isPast = currentIdx >= 0 && idx < currentIdx;
              const status = isCurrent ? 'current' : isPast ? 'done' : 'pending';

              return (
                <li
                  key={node.id}
                  className={
                    'flex items-start gap-3 rounded-md border p-3 ' +
                    (isCurrent
                      ? 'border-primary-300 bg-primary-50'
                      : isPast
                        ? 'border-secondary-200 bg-white opacity-60'
                        : 'border-secondary-200 bg-white')
                  }
                >
                  <div
                    className={
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' +
                      (isCurrent
                        ? 'bg-primary-600 text-white'
                        : isPast
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-secondary-100 text-secondary-500')
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-secondary-900">
                      <span className="mr-2 text-secondary-400">{idx + 1}.</span>
                      {node.type.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-secondary-500">{node.id}</p>
                  </div>
                  <Badge variant={isCurrent ? 'primary' : isPast ? 'success' : 'default'}>
                    {status}
                  </Badge>
                </li>
              );
            })}
          </ol>
          {currentIdx === -1 && run.currentNodeId ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Current step <code className="font-mono">{run.currentNodeId}</code> is on a branch
              path that isn't visible in this linear view. Open the workflow editor to see the full
              graph.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-secondary-500">{label}</dt>
      <dd className="truncate text-right text-secondary-900">
        {value || <span className="text-secondary-400">—</span>}
      </dd>
    </div>
  );
}
