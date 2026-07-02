import { ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Survey {
  id: string;
  name: string;
  description: string | null;
  questions: unknown;
  active: boolean;
  submitCount: number;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function SurveysPage() {
  const surveys = await apiFetch<Survey[]>('/api/v1/surveys', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Surveys &amp; NPS</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Collect feedback and NPS/CSAT scores; responses can trigger automations.
        </p>
      </header>

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No surveys yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create one from an NPS/CSAT template via the API to start collecting responses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {surveys.map((s) => {
            const qCount = Array.isArray(s.questions) ? s.questions.length : 0;
            return (
              <li key={s.id}>
                <Card>
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-secondary-900">{s.name}</p>
                      <Badge variant={s.active ? 'success' : 'default'}>
                        {s.active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    {s.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-secondary-500">{s.description}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-3 text-xs text-secondary-500">
                      <span>{qCount} questions</span>
                      <span>·</span>
                      <span>
                        <span className="font-semibold tabular-nums text-secondary-900">
                          {s.submitCount.toLocaleString('cs-CZ')}
                        </span>{' '}
                        responses
                      </span>
                    </div>
                    {s.active ? (
                      <a
                        href={`${API_BASE}/public/surveys/${s.id}/hosted`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs text-primary-600 hover:underline"
                      >
                        Open hosted page →
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
