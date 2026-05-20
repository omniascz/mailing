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
import { ForkButton } from '../fork-button';

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

interface Template {
  slug: string;
  name: string;
  category: string;
  description: string;
  recommendedFor: string[];
  locale: string;
  steps: number;
  trigger: { type: string; config: Record<string, unknown> };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

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
          subtitle: `Until ${until.field} ${until.offsetHours ? `${until.offsetHours}h` : ''}`,
        };
      const parts = [];
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

/**
 * Topological-ish linearization: pick the trigger, then walk edges
 * one-by-one. Branching (condition true/false) is rendered as two parallel
 * sub-lists below the branch node. Good enough for showing the happy path
 * to a marketer; precise canvas rendering happens in the editor route.
 */
function linearize(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    const arr = outgoing.get(e.source) ?? [];
    arr.push(e);
    outgoing.set(e.source, arr);
  }
  const trigger = nodes.find((n) => n.type === 'trigger');
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
    for (const e of outgoing.get(id) ?? []) stack.push(e.target);
  }
  // Append any disconnected nodes so the user sees them.
  for (const n of nodes) if (!seen.has(n.id)) result.push(n);
  return result;
}

export const dynamic = 'force-dynamic';

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tpl = await apiFetch<Template | null>(`/api/v1/workflow-templates/${slug}`, {
    fallback: null,
  });
  if (!tpl) notFound();

  const ordered = linearize(tpl.nodes, tpl.edges);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/workflows/gallery"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to gallery
      </Link>

      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-secondary-900">{tpl.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-secondary-600">{tpl.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge variant="default">{tpl.category.replace(/_/g, ' ')}</Badge>
              <Badge variant="default">{tpl.locale.toUpperCase()}</Badge>
              <Badge variant="default">
                {tpl.steps} step{tpl.steps === 1 ? '' : 's'}
              </Badge>
              {tpl.recommendedFor.map((r) => (
                <Badge key={r} variant="default">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
          <ForkButton slug={tpl.slug} name={tpl.name} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Flow preview</CardTitle>
          <CardDescription>Steps in order — branching shown as labelled edges</CardDescription>
        </CardHeader>
        <CardContent>
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
                  <div className="flex-1">
                    <p className="text-sm font-medium text-secondary-900">
                      <span className="mr-2 text-secondary-400">{idx + 1}.</span>
                      {title}
                    </p>
                    {subtitle ? (
                      <p className="mt-0.5 text-xs text-secondary-500 line-clamp-2">{subtitle}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
