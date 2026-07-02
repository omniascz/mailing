import { Boxes } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface CustomObjectDefinition {
  id: string;
  key: string;
  singularLabel: string;
  pluralLabel: string;
  description: string | null;
  fields: unknown;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function CustomObjectsPage() {
  const defs = await apiFetch<CustomObjectDefinition[]>('/api/v1/custom-objects', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Custom objects</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Model your own records (e.g. subscriptions, pets, policies) and relate them to contacts.
        </p>
      </header>

      {defs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Boxes className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No custom objects yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {defs.map((d) => {
            const fieldCount = Array.isArray(d.fields) ? d.fields.length : 0;
            return (
              <li key={d.id}>
                <Card>
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-secondary-900">{d.pluralLabel}</p>
                      <Badge variant="default">{fieldCount} fields</Badge>
                    </div>
                    <p className="font-mono text-xs text-secondary-500">{d.key}</p>
                    {d.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-secondary-600">{d.description}</p>
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
