import { Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface DataSet {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function DataSetsPage() {
  const sets = await apiFetch<DataSet[]>('/api/v1/data-sets', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Data sets</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Reusable saved queries / materialized slices that feed reports and segments.
        </p>
      </header>

      {sets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No data sets yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sets.map((d) => (
            <li key={d.id}>
              <Card>
                <CardContent>
                  <p className="font-medium text-secondary-900">{d.name}</p>
                  {d.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-secondary-500">{d.description}</p>
                  ) : null}
                  <p className="mt-3 text-xs text-secondary-500">
                    Created {new Date(d.createdAt).toLocaleDateString('cs-CZ')}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
