import { FlaskConical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface MultivariateTest {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'running' | 'completed' | 'cancelled' | string;
  winnerMetric: string | null;
  testAudiencePercent: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  draft: 'default',
  running: 'primary',
  completed: 'success',
  cancelled: 'warning',
};

export default async function AbTestsPage() {
  const tests = await apiFetch<MultivariateTest[]>('/api/v1/multivariate-tests', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">A/B &amp; multivariate tests</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Test up to 8 variants of subject / content / send-time; a winner is selected on your
          chosen metric and can auto-send to the remaining audience.
        </p>
      </header>

      {tests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No tests yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Multivariate tests are created alongside a campaign via the API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {tests.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-secondary-900">{t.name}</p>
                      {t.description ? (
                        <p className="mt-1 line-clamp-1 text-xs text-secondary-500">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={STATUS_TONE[t.status] ?? 'default'}>{t.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-secondary-500">
                    {t.winnerMetric ? <span>Winner by {t.winnerMetric}</span> : null}
                    {t.testAudiencePercent != null ? (
                      <span>{t.testAudiencePercent}% test audience</span>
                    ) : null}
                    <span>
                      {t.completedAt
                        ? `Completed ${new Date(t.completedAt).toLocaleDateString('cs-CZ')}`
                        : t.startedAt
                          ? `Started ${new Date(t.startedAt).toLocaleDateString('cs-CZ')}`
                          : `Created ${new Date(t.createdAt).toLocaleDateString('cs-CZ')}`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
