import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, Clock, Code2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { RunAgentButton } from './run-agent-button';

interface AiAgent {
  id: string;
  name: string;
  agentType: string;
  description: string | null;
  goal: string;
  status: 'active' | 'paused' | 'archived';
  schedule: string | null;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentRun {
  id: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  tokensUsed: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<AiAgent['status'], 'default' | 'success' | 'warning'> = {
  active: 'success',
  paused: 'warning',
  archived: 'default',
};

const RUN_TONE: Record<AgentRun['status'], 'default' | 'primary' | 'success' | 'danger'> = {
  pending: 'default',
  running: 'primary',
  completed: 'success',
  failed: 'danger',
  cancelled: 'default',
};

export const dynamic = 'force-dynamic';

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [agent, runs] = await Promise.all([
    apiFetch<AiAgent | null>(`/api/v1/ai-agents/${id}`, { fallback: null }),
    apiFetch<AgentRun[]>(`/api/v1/ai-agents/${id}/runs`, { fallback: [] }),
  ]);
  if (!agent) notFound();

  const totalTokens = runs.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/ai-agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to agents
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <h1 className="truncate text-2xl font-semibold text-secondary-900">{agent.name}</h1>
            <Badge variant={STATUS_TONE[agent.status]}>{agent.status}</Badge>
            <Badge variant="default">{agent.agentType}</Badge>
          </div>
          {agent.description ? (
            <p className="mt-2 max-w-2xl text-sm text-secondary-600">{agent.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-secondary-500">
            {agent.schedule ? (
              <>
                Schedule: <code className="font-mono">{agent.schedule}</code> ·{' '}
              </>
            ) : (
              'Manual triggers only · '
            )}
            Created {new Date(agent.createdAt).toLocaleDateString('cs-CZ')}
          </p>
        </div>
        <RunAgentButton agentId={agent.id} />
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total runs" value={runs.length.toLocaleString('cs-CZ')} />
        <Kpi
          label="Completed"
          value={runs.filter((r) => r.status === 'completed').length.toLocaleString('cs-CZ')}
          tone="good"
        />
        <Kpi
          label="Failed"
          value={runs.filter((r) => r.status === 'failed').length.toLocaleString('cs-CZ')}
          tone={runs.some((r) => r.status === 'failed') ? 'bad' : undefined}
        />
        <Kpi label="Tokens used" value={totalTokens.toLocaleString('cs-CZ')} />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Goal</CardTitle>
            <CardDescription>The system prompt sent to Claude on every run.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md border border-secondary-200 bg-secondary-50 p-3 text-xs leading-relaxed text-secondary-800">
              {agent.goal}
            </pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-secondary-400" />
              Config
            </CardTitle>
            <CardDescription>
              Per-agent settings — filters, thresholds, channel preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(agent.config ?? {}).length === 0 ? (
              <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-3 text-center text-xs text-secondary-500">
                No config — using defaults for {agent.agentType}.
              </p>
            ) : (
              <pre className="overflow-auto rounded-md bg-secondary-900 p-3 text-xs leading-relaxed text-secondary-100">
                {JSON.stringify(agent.config, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-secondary-400" />
            Recent runs
          </CardTitle>
          <CardDescription>Most recent first. Click a row for full input/output.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="rounded-md border border-dashed border-secondary-300 bg-secondary-50 p-4 text-center text-sm text-secondary-500">
              No runs yet. Click "Run now" to trigger the agent manually.
            </p>
          ) : (
            <ul className="divide-y divide-secondary-100">
              {runs.slice(0, 20).map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={RUN_TONE[r.status]}>{r.status}</Badge>
                      <span className="font-mono text-xs text-secondary-500">
                        {r.id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="text-right text-xs text-secondary-500">
                      <p>
                        {r.startedAt
                          ? new Date(r.startedAt).toLocaleString('cs-CZ')
                          : new Date(r.createdAt).toLocaleString('cs-CZ')}
                      </p>
                      {r.tokensUsed ? (
                        <p className="tabular-nums text-secondary-400">
                          {r.tokensUsed.toLocaleString('cs-CZ')} tokens
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {r.error ? (
                    <p className="mt-1 text-xs text-rose-600">{r.error.slice(0, 200)}</p>
                  ) : null}
                  {r.output && Object.keys(r.output).length > 0 ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary-700 hover:text-primary-900">
                        View output
                      </summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-secondary-900 p-2 text-xs leading-relaxed text-secondary-100">
                        {JSON.stringify(r.output, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
