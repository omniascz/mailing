import { UsersRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const teams = await apiFetch<Team[]>('/api/v1/teams', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Teams</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Group members for round-robin assignment, shared inboxes and permissions.
        </p>
      </header>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UsersRound className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No teams yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {teams.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent>
                  <p className="font-medium text-secondary-900">{t.name}</p>
                  <p className="font-mono text-xs text-secondary-500">{t.slug}</p>
                  {t.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-secondary-600">{t.description}</p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
