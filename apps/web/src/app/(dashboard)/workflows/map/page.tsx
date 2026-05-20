import Link from 'next/link';
import { ArrowLeft, ArrowRight, Workflow as WorkflowIcon, Network } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface MapNode {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  triggerType: string;
  totalRuns: number;
  completedRuns: number;
}

interface MapEdge {
  from: string;
  to: string;
  viaNodeId: string;
  type: 'start_workflow';
}

interface WorkflowMap {
  nodes: MapNode[];
  edges: MapEdge[];
}

const STATUS_TONE: Record<MapNode['status'], 'default' | 'success' | 'warning' | 'primary'> = {
  draft: 'default',
  active: 'success',
  paused: 'warning',
  archived: 'primary',
};

const TRIGGER_LABEL: Record<string, string> = {
  manual: 'Manual',
  list_subscribe: 'List subscribe',
  tag_added: 'Tag added',
  date_field: 'Date field',
  api_event: 'Custom API event',
  form_submit: 'Form submit',
  purchase_event: 'Purchase',
  name_day_today: 'CZ jmeniny',
  n_days_before_holiday: 'Before holiday',
  lifecycle_stage_changed: 'Lifecycle change',
  loyalty_points_earned: 'Loyalty points',
  loyalty_tier_up: 'Tier upgrade',
  loyalty_reward_redeemed: 'Reward redeemed',
};

export const dynamic = 'force-dynamic';

export default async function AutomationMapPage() {
  const map = await apiFetch<WorkflowMap | null>('/api/v1/workflows/map', { fallback: null });
  const nodes = map?.nodes ?? [];
  const edges = map?.edges ?? [];

  // Group nodes by trigger type for the column layout
  const byTrigger = new Map<string, MapNode[]>();
  for (const n of nodes) {
    const arr = byTrigger.get(n.triggerType) ?? [];
    arr.push(n);
    byTrigger.set(n.triggerType, arr);
  }

  // Index edges by source workflow id for the "this triggers" annotation
  const outgoing = new Map<string, MapEdge[]>();
  for (const e of edges) {
    const arr = outgoing.get(e.from) ?? [];
    arr.push(e);
    outgoing.set(e.from, arr);
  }
  // Inbound for "started by"
  const incoming = new Map<string, MapEdge[]>();
  for (const e of edges) {
    const arr = incoming.get(e.to) ?? [];
    arr.push(e);
    incoming.set(e.to, arr);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/workflows"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to workflows
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-secondary-900">Automation map</h1>
        </div>
        <p className="mt-1 text-sm text-secondary-500">
          Where workflows hand off to each other via{' '}
          <code className="font-mono text-xs">start_workflow</code> nodes. Catches forgotten "stuck
          on workflow X" loops and orphans.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Workflows" value={nodes.length.toLocaleString('cs-CZ')} />
        <Kpi
          label="Active"
          value={nodes.filter((n) => n.status === 'active').length.toLocaleString('cs-CZ')}
          tone="good"
        />
        <Kpi
          label="Hand-offs"
          value={edges.length.toLocaleString('cs-CZ')}
          tone={edges.length > 0 ? 'good' : undefined}
        />
        <Kpi label="Trigger types" value={byTrigger.size.toLocaleString('cs-CZ')} />
      </section>

      {nodes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WorkflowIcon className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No workflows yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              The map populates once you have one or more workflows in this workspace.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(byTrigger.entries()).map(([triggerType, group]) => (
            <div key={triggerType}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-secondary-500">
                {TRIGGER_LABEL[triggerType] ?? triggerType}
              </p>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {group.map((node) => {
                  const out = outgoing.get(node.id) ?? [];
                  const inc = incoming.get(node.id) ?? [];
                  const successRate =
                    node.totalRuns > 0
                      ? `${((node.completedRuns / node.totalRuns) * 100).toFixed(0)}%`
                      : '—';
                  return (
                    <li key={node.id}>
                      <Card className="h-full">
                        <CardContent>
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/workflows/${node.id}`}
                              className="font-medium text-secondary-900 hover:text-primary-700"
                            >
                              {node.name}
                            </Link>
                            <Badge variant={STATUS_TONE[node.status]}>{node.status}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-secondary-500">
                            <span className="tabular-nums font-semibold text-secondary-900">
                              {node.totalRuns.toLocaleString('cs-CZ')}
                            </span>{' '}
                            runs · {successRate} success
                          </p>

                          {out.length > 0 ? (
                            <div className="mt-3 border-t border-secondary-100 pt-2">
                              <p className="text-xs text-secondary-500">Hands off to:</p>
                              <ul className="mt-1 space-y-0.5">
                                {out.map((edge) => {
                                  const target = byId.get(edge.to);
                                  return (
                                    <li
                                      key={edge.viaNodeId}
                                      className="inline-flex items-center gap-1 text-xs"
                                    >
                                      <ArrowRight className="h-3 w-3 text-secondary-400" />
                                      {target ? (
                                        <Link
                                          href={`/workflows/${target.id}`}
                                          className="font-medium text-primary-700 hover:text-primary-900"
                                        >
                                          {target.name}
                                        </Link>
                                      ) : (
                                        <span className="font-mono text-secondary-500">
                                          {edge.to.slice(0, 8)}…
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}

                          {inc.length > 0 ? (
                            <div className="mt-2 border-t border-secondary-100 pt-2">
                              <p className="text-xs text-secondary-500">Started by:</p>
                              <ul className="mt-1 space-y-0.5">
                                {inc.map((edge) => {
                                  const source = byId.get(edge.from);
                                  return (
                                    <li
                                      key={edge.viaNodeId}
                                      className="inline-flex items-center gap-1 text-xs"
                                    >
                                      <span className="text-secondary-400">←</span>
                                      {source ? (
                                        <Link
                                          href={`/workflows/${source.id}`}
                                          className="font-medium text-primary-700 hover:text-primary-900"
                                        >
                                          {source.name}
                                        </Link>
                                      ) : (
                                        <span className="font-mono text-secondary-500">
                                          {edge.from.slice(0, 8)}…
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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
