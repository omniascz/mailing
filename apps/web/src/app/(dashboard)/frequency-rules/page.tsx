import { Gauge } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface FrequencyRule {
  id: string;
  channel: string;
  maxCount: number;
  periodHours: number;
  engagementBand: string | null;
}

export const dynamic = 'force-dynamic';

export default async function FrequencyRulesPage() {
  const rows = await apiFetch<FrequencyRule[]>('/api/v1/frequency-rules', { fallback: [] });

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Frequency caps</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Limit how many marketing messages a contact receives per channel over a window.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gauge className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No frequency caps set</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <span className="font-medium capitalize text-secondary-900">{r.channel}</span>
                    {r.engagementBand ? (
                      <Badge variant="default" className="ml-2">
                        {r.engagementBand}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-sm text-secondary-700">
                    max <span className="font-semibold tabular-nums">{r.maxCount}</span> /{' '}
                    {r.periodHours}h
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
