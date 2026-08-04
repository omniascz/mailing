import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface CustomReport {
  id: string;
  name: string;
  definition: {
    metrics: string[];
    dimension: string;
    rangeDays?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const reports = await apiFetch<CustomReport[]>('/api/v1/reports', { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Reports</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Custom reports over your email events — pick metrics (opens, clicks, rates, unique
          opens/clicks) and a dimension (by day / week / month / campaign).
        </p>
      </header>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No saved reports yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Reports are created via the API (POST /api/v1/reports) or a scheduled report of type
              &quot;custom&quot;. Saved reports show up here to run on demand.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/${r.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-secondary-900">{r.name}</p>
                      <Badge variant="default">{r.definition.dimension}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {r.definition.metrics.slice(0, 6).map((m) => (
                        <Badge key={m} variant="default">
                          {m}
                        </Badge>
                      ))}
                      {r.definition.metrics.length > 6 ? (
                        <Badge variant="default">+{r.definition.metrics.length - 6}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-4 text-xs text-secondary-500">
                      {r.definition.rangeDays ? `Last ${r.definition.rangeDays} days` : 'All time'}{' '}
                      · Updated {new Date(r.updatedAt).toLocaleDateString('cs-CZ')}
                    </p>
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
