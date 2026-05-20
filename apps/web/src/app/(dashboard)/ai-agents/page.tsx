import Link from 'next/link';
import { Bot, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { NewAgentButton } from './new-agent-button';

interface AiAgent {
  id: string;
  name: string;
  agentType: string;
  description: string | null;
  goal: string;
  status: 'active' | 'paused' | 'archived';
  schedule: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<AiAgent['status'], 'default' | 'success' | 'warning'> = {
  active: 'success',
  paused: 'warning',
  archived: 'default',
};

const TYPE_LABELS: Record<string, string> = {
  campaign_builder: 'Campaign builder',
  contact_cleanup: 'Contact cleanup',
  segment_optimizer: 'Segment optimizer',
  re_engagement: 'Re-engagement',
  custom: 'Custom',
};

export const dynamic = 'force-dynamic';

export default async function AiAgentsPage() {
  const agents = await apiFetch<AiAgent[]>('/api/v1/ai-agents', { fallback: [] });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-secondary-900">AI agents</h1>
          </div>
          <p className="mt-1 text-sm text-secondary-500">
            Claude-powered agents that run on a schedule or on demand — build campaigns, clean
            contacts, re-engage cold leads, or run custom goals.
          </p>
        </div>
        <NewAgentButton />
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Agents" value={agents.length.toLocaleString('cs-CZ')} />
        <Kpi
          label="Active"
          value={agents.filter((a) => a.status === 'active').length.toLocaleString('cs-CZ')}
          tone="good"
        />
        <Kpi
          label="Scheduled"
          value={agents.filter((a) => a.schedule).length.toLocaleString('cs-CZ')}
        />
        <Kpi
          label="Ran in last 24h"
          value={agents
            .filter((a) => a.lastRunAt && Date.now() - new Date(a.lastRunAt).getTime() < 86_400_000)
            .length.toLocaleString('cs-CZ')}
        />
      </section>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No AI agents yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create your first agent — start with a campaign builder if you're not sure.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {agents.map((a) => (
            <li key={a.id}>
              <Link href={`/ai-agents/${a.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-secondary-900">{a.name}</p>
                        <p className="mt-0.5 text-xs text-secondary-500">
                          {TYPE_LABELS[a.agentType] ?? a.agentType}
                          {a.schedule ? (
                            <>
                              {' · '}
                              <code className="font-mono">{a.schedule}</code>
                            </>
                          ) : (
                            ' · Manual'
                          )}
                        </p>
                      </div>
                      <Badge variant={STATUS_TONE[a.status]}>{a.status}</Badge>
                    </div>
                    {a.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-secondary-600">
                        {a.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-secondary-100 pt-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-secondary-500">
                        <Clock className="h-3 w-3" />
                        {a.lastRunAt
                          ? `Last ${new Date(a.lastRunAt).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                          : 'Never run'}
                      </span>
                      {a.nextRunAt ? (
                        <span className="text-secondary-500">
                          Next{' '}
                          {new Date(a.nextRunAt).toLocaleString('cs-CZ', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-secondary-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'good' ? 'text-emerald-600' : 'text-secondary-900'}`}
      >
        {value}
      </p>
    </div>
  );
}
