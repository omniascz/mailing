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
  UserPlus,
  Tag,
  ListPlus,
  ListMinus,
  Bell,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface NodeStat {
  nodeId: string;
  type: string;
  /** False when nothing was ever measured for this step — not the same as 0. */
  recorded: boolean;
  entered: number;
  advanced: number;
  branchedTrue: number;
  branchedFalse: number;
  waited: number;
  resumed: number;
  endedHere: number;
  failedHere: number;
  currentlyHere: number;
}

interface NodeBreakdown {
  hasData: boolean;
  runsPredatingTracking: number;
  trackingSince: string | null;
  nodes: NodeStat[];
}

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
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
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

const NODE_ICONS: Record<string, typeof Mail> = {
  trigger: GitBranch,
  send_email: Mail,
  send_sms: MessageSquare,
  send_whatsapp: MessageSquare,
  send_push: Bell,
  make_voice_call: Phone,
  wait: Clock,
  condition: GitBranch,
  add_tag: Tag,
  remove_tag: Tag,
  move_to_list: ListPlus,
  remove_from_list: ListMinus,
  send_webhook: Webhook,
  assign_task: UserPlus,
};

function describeNode(node: WorkflowNode): { title: string; subtitle?: string } {
  switch (node.type) {
    case 'trigger':
      return { title: 'Trigger', subtitle: String(node.config.triggerType ?? 'manual') };
    case 'send_email':
      return { title: 'Send email', subtitle: String(node.config.subject ?? '') };
    case 'send_sms':
      return {
        title: 'Send SMS',
        subtitle: String((node.config.body as string)?.slice(0, 80) ?? ''),
      };
    case 'wait': {
      const d = node.config.duration as { days?: number; hours?: number } | undefined;
      const until = node.config.until as { field?: string; offsetHours?: number } | undefined;
      if (until)
        return {
          title: 'Wait',
          subtitle: `Until ${until.field}${until.offsetHours ? ` ${until.offsetHours}h` : ''}`,
        };
      const parts: string[] = [];
      if (d?.days) parts.push(`${d.days}d`);
      if (d?.hours) parts.push(`${d.hours}h`);
      return { title: 'Wait', subtitle: parts.join(' ') || 'immediate' };
    }
    case 'condition':
      return { title: 'Condition', subtitle: 'If/else branch' };
    case 'move_to_list':
      return { title: 'Move to list', subtitle: String(node.config.listSlug ?? '') };
    case 'assign_task':
      return { title: 'Assign task', subtitle: String(node.config.taskType ?? '') };
    default:
      return { title: node.type.replace(/_/g, ' ') };
  }
}

function linearize(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const arr = outgoing.get(edge.source) ?? [];
    arr.push(edge);
    outgoing.set(edge.source, arr);
  }
  const trigger = nodes.find((n) => n.type === 'trigger') ?? nodes[0];
  if (!trigger) return nodes;
  const result: WorkflowNode[] = [];
  const seen = new Set<string>();
  const stack: string[] = [trigger.id];
  while (stack.length) {
    const id = stack.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) result.push(node);
    for (const out of outgoing.get(id) ?? []) stack.push(out.target);
  }
  for (const n of nodes) if (!seen.has(n.id)) result.push(n);
  return result;
}

export const dynamic = 'force-dynamic';

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [wf, steps] = await Promise.all([
    apiFetch<Workflow | null>(`/api/v1/workflows/${id}`, { fallback: null }),
    apiFetch<NodeBreakdown | null>(`/api/v1/workflows/${id}/node-analytics`, { fallback: null }),
  ]);
  if (!wf) notFound();

  const statByNode = new Map((steps?.nodes ?? []).map((n) => [n.nodeId, n]));

  const ordered = linearize(wf.nodes, wf.edges);
  const success = wf.totalRuns > 0 ? ((wf.completedRuns / wf.totalRuns) * 100).toFixed(1) : '—';
  const failure = wf.totalRuns > 0 ? ((wf.failedRuns / wf.totalRuns) * 100).toFixed(1) : '—';

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/workflows"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to workflows
      </Link>

      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold text-secondary-900">{wf.name}</h1>
              <Badge variant={STATUS_TONE[wf.status]}>{wf.status}</Badge>
            </div>
            {wf.description ? (
              <p className="mt-2 text-sm text-secondary-600">{wf.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-secondary-500">
              Trigger: {wf.triggerType} · Updated {new Date(wf.updatedAt).toLocaleString('cs-CZ')}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/workflows/${wf.id}/runs`}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-50"
            >
              Run history
            </Link>
            <Link
              href={`/workflows/${wf.id}/edit`}
              className="inline-flex items-center gap-2 rounded-md bg-secondary-100 px-3 py-1.5 text-sm font-medium text-secondary-800 hover:bg-secondary-200"
            >
              Edit
            </Link>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total runs" value={wf.totalRuns.toLocaleString('cs-CZ')} />
        <Kpi label="Completed" value={wf.completedRuns.toLocaleString('cs-CZ')} tone="good" />
        <Kpi
          label="Failed"
          value={wf.failedRuns.toLocaleString('cs-CZ')}
          tone={wf.failedRuns > 0 ? 'bad' : undefined}
        />
        <Kpi label="Success rate" value={success === '—' ? '—' : `${success}%`} tone="good" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <CardDescription>
            Read-only view. Open the editor to change the canvas — branching shown as parallel
            edges.
          </CardDescription>
          {steps && !steps.hasData ? (
            <p className="mt-3 rounded-md bg-secondary-50 px-3 py-2 text-xs text-secondary-600">
              No step data for this workflow. Per-step counting starts the first time a contact
              enters it — runs from before that are not counted, and are shown as “—” rather than
              zero.
            </p>
          ) : null}
          {steps?.hasData && steps.runsPredatingTracking > 0 ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {steps.runsPredatingTracking.toLocaleString('cs-CZ')} earlier{' '}
              {steps.runsPredatingTracking === 1 ? 'run is' : 'runs are'} missing from these numbers
              — they finished before step counting began
              {steps.trackingSince
                ? ` on ${new Date(steps.trackingSince).toLocaleDateString('cs-CZ')}`
                : ''}
              .
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {ordered.length === 0 ? (
            <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-4 text-center text-sm text-secondary-500">
              Empty workflow — add a trigger to begin.
            </p>
          ) : (
            <ol className="space-y-3">
              {ordered.map((node, idx) => {
                const Icon = NODE_ICONS[node.type] ?? GitBranch;
                const { title, subtitle } = describeNode(node);
                return (
                  <li
                    key={node.id}
                    className="flex items-start gap-3 rounded-md border border-secondary-200 bg-white p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-secondary-900">
                        <span className="mr-2 text-secondary-400">{idx + 1}.</span>
                        {title}
                      </p>
                      {subtitle ? (
                        <p className="mt-0.5 text-xs text-secondary-500 line-clamp-2">{subtitle}</p>
                      ) : null}
                    </div>
                    <StepNumbers stat={statByNode.get(node.id)} />
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-4 text-xs text-secondary-500">
            Failure rate {failure === '—' ? '—' : `${failure}%`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The per-step numbers, deliberately as separate figures.
 *
 * "Entered" and "moved on" are the two that matter at a glance; the rest are
 * the three unrelated ways a contact stops being at a step, and they are shown
 * apart because adding them together would read as a loss where there is none.
 * A step nobody has reached shows “—”: a zero here would claim a measurement
 * that was never taken.
 */
function StepNumbers({ stat }: { stat?: NodeStat }) {
  if (!stat?.recorded) {
    return (
      <div className="shrink-0 text-right">
        <p className="text-xs text-secondary-400" title="Nothing recorded for this step yet">
          —
        </p>
      </div>
    );
  }

  const parts: Array<{ label: string; value: number; tone?: 'bad' | 'muted' }> = [
    { label: 'entered', value: stat.entered },
    { label: 'moved on', value: stat.advanced },
  ];
  if (stat.branchedTrue || stat.branchedFalse) {
    parts.push({ label: 'yes', value: stat.branchedTrue, tone: 'muted' });
    parts.push({ label: 'no', value: stat.branchedFalse, tone: 'muted' });
  }
  if (stat.currentlyHere) parts.push({ label: 'here now', value: stat.currentlyHere });
  if (stat.waited) parts.push({ label: 'waited', value: stat.waited, tone: 'muted' });
  if (stat.endedHere) parts.push({ label: 'ended here', value: stat.endedHere, tone: 'muted' });
  if (stat.failedHere) parts.push({ label: 'failed', value: stat.failedHere, tone: 'bad' });

  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-1 text-right">
      {parts.map((p) => (
        <div key={p.label} className="min-w-[4.5rem]">
          <p
            className={
              'text-sm font-semibold tabular-nums ' +
              (p.tone === 'bad'
                ? 'text-rose-600'
                : p.tone === 'muted'
                  ? 'text-secondary-500'
                  : 'text-secondary-900')
            }
          >
            {p.value.toLocaleString('cs-CZ')}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-secondary-400">{p.label}</p>
        </div>
      ))}
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
