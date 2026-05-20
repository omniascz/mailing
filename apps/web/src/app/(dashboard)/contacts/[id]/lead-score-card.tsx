import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface LeadScoreEvent {
  id: string;
  eventType: string;
  points: number;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Score band heuristic — backend doesn't bracket scores, so we draw the
 * lines client-side. Tweak when you have real distribution data from
 * predictive analytics.
 */
function band(score: number): { label: string; tone: 'bad' | 'warn' | 'good' | 'neutral' } {
  if (score >= 70) return { label: 'Hot', tone: 'good' };
  if (score >= 30) return { label: 'Warm', tone: 'warn' };
  if (score <= 0) return { label: 'Cold', tone: 'bad' };
  return { label: 'New', tone: 'neutral' };
}

export function LeadScoreCard({
  currentScore,
  history,
}: {
  currentScore: number;
  history: LeadScoreEvent[];
}) {
  const b = band(currentScore);
  const toneClass =
    b.tone === 'good'
      ? 'text-emerald-600'
      : b.tone === 'warn'
        ? 'text-amber-600'
        : b.tone === 'bad'
          ? 'text-rose-600'
          : 'text-secondary-900';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-secondary-400" />
          Lead score
        </CardTitle>
        <CardDescription>Rules-based engagement score</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
          {currentScore.toLocaleString('cs-CZ')}
        </p>
        <p className="mt-1 text-xs text-secondary-500">
          Band: <span className="font-medium">{b.label}</span>
          {' · '}
          <Link href="/lead-scoring" className="text-primary-700 hover:text-primary-900">
            Manage rules
          </Link>
        </p>

        {history.length > 0 ? (
          <div className="mt-4 border-t border-secondary-100 pt-3">
            <p className="text-xs font-medium text-secondary-500">Recent events</p>
            <ul className="mt-1.5 space-y-1">
              {history.slice(0, 6).map((ev) => {
                const positive = ev.points > 0;
                const Icon = positive ? TrendingUp : TrendingDown;
                return (
                  <li key={ev.id} className="flex items-center gap-2 text-xs">
                    <Icon
                      className={`h-3 w-3 shrink-0 ${positive ? 'text-emerald-600' : 'text-rose-600'}`}
                    />
                    <code className="flex-1 truncate font-mono text-secondary-700">
                      {ev.eventType}
                    </code>
                    <span
                      className={
                        'tabular-nums font-semibold ' +
                        (positive ? 'text-emerald-700' : 'text-rose-700')
                      }
                    >
                      {positive ? `+${ev.points}` : ev.points}
                    </span>
                    <time className="text-secondary-400" dateTime={ev.createdAt}>
                      {new Date(ev.createdAt).toLocaleDateString('cs-CZ', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </time>
                  </li>
                );
              })}
            </ul>
            {history.length > 6 ? (
              <p className="mt-2 text-xs text-secondary-400">+{history.length - 6} older events</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
