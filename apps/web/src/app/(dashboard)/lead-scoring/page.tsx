import { TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { NewRuleButton } from './new-rule-button';
import { SeedDefaultsButton } from './seed-defaults-button';
import { RunDecayButton } from './run-decay-button';
import { RuleActions } from './rule-actions';

interface LeadScoreRule {
  id: string;
  eventType: string;
  points: number;
  decayDays: number | null;
  description: string | null;
  active: boolean;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function LeadScoringPage() {
  const rules = await apiFetch<LeadScoreRule[]>('/api/v1/lead-scoring/rules', { fallback: [] });

  const totalPositive = rules.filter((r) => r.points > 0 && r.active).length;
  const totalNegative = rules.filter((r) => r.points < 0 && r.active).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Lead scoring</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Rules-based contact scoring. Triggered by events (open, click, form submit, custom API
            events), with optional decay so cold leads don't keep their score forever.
          </p>
        </div>
        <div className="flex gap-2">
          {rules.length === 0 ? <SeedDefaultsButton /> : null}
          <RunDecayButton />
          <NewRuleButton />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Rules" value={rules.length.toLocaleString('cs-CZ')} />
        <Kpi label="Active +pts" value={totalPositive.toLocaleString('cs-CZ')} tone="good" />
        <Kpi label="Active -pts" value={totalNegative.toLocaleString('cs-CZ')} tone="bad" />
        <Kpi
          label="With decay"
          value={rules.filter((r) => r.decayDays && r.active).length.toLocaleString('cs-CZ')}
        />
      </section>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No scoring rules yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Seed the default set (open / click / purchase / unsubscribe) or add a custom rule.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-secondary-200 bg-white">
          <table className="w-full">
            <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
              <tr>
                <th className="px-4 py-3 font-medium">Event type</th>
                <th className="px-4 py-3 text-right font-medium">Points</th>
                <th className="px-4 py-3 font-medium">Decay</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100 text-sm">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-secondary-50">
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs text-secondary-900">{r.eventType}</code>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        'tabular-nums font-semibold ' +
                        (r.points > 0
                          ? 'text-emerald-700'
                          : r.points < 0
                            ? 'text-rose-700'
                            : 'text-secondary-700')
                      }
                    >
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary-600">
                    {r.decayDays ? (
                      `${r.decayDays} days`
                    ) : (
                      <span className="text-secondary-400">never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary-600">
                    {r.description ?? <span className="text-secondary-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.active ? 'success' : 'default'}>
                      {r.active ? 'Active' : 'Paused'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RuleActions rule={r} />
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
