import Link from 'next/link';
import { Filter, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  /** 'static' | 'dynamic' | similar */
  type: string;
  /** denormalized count, may be stale */
  contactCount: number | null;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const dynamic = 'force-dynamic';

export default async function SegmentsPage() {
  const segments = await apiFetch<Segment[]>('/api/v1/segments', { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Segments</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Reusable audience slices. RFM cohorts (Champions / At Risk / Lost) are also available
            directly when picking an audience.
          </p>
        </div>
        <Link
          href="/segments/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New segment
        </Link>
      </header>

      {segments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Filter className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No segments yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create a segment to target a subset of your contacts in campaigns and workflows.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {segments.map((s) => (
            <li key={s.id}>
              <Link href={`/segments/${s.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-secondary-900">{s.name}</p>
                        {s.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-secondary-500">
                            {s.description}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="default">{s.type}</Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-secondary-500">
                      <span>
                        <span className="font-semibold tabular-nums text-secondary-900">
                          {(s.contactCount ?? 0).toLocaleString('cs-CZ')}
                        </span>{' '}
                        contacts
                      </span>
                      <span>
                        {s.lastEvaluatedAt
                          ? `Evaluated ${new Date(s.lastEvaluatedAt).toLocaleString('cs-CZ')}`
                          : `Created ${new Date(s.createdAt).toLocaleDateString('cs-CZ')}`}
                      </span>
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
