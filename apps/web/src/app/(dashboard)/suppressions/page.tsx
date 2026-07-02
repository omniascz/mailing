import { ShieldBan } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Suppression {
  id: string;
  email: string | null;
  phone: string | null;
  reason: string;
  notes: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function SuppressionsPage() {
  const rows = await apiFetch<Suppression[]>('/api/v1/suppressions', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Suppression list</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Addresses that are never sent to — hard bounces, complaints, and manual blocks.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldBan className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">Nothing suppressed</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-secondary-900">
                      {s.email ?? s.phone ?? '—'}
                    </p>
                    {s.notes ? (
                      <p className="truncate text-xs text-secondary-500">{s.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="danger">{s.reason}</Badge>
                    <span className="text-xs text-secondary-500">
                      {new Date(s.createdAt).toLocaleDateString('cs-CZ')}
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
