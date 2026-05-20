import Link from 'next/link';
import { ArrowLeft, Users, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount?: number;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage() {
  const teams = await apiFetch<Team[]>('/api/v1/teams', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-secondary-600 hover:text-secondary-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>

      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Team</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Group members into teams to scope visibility — e.g. CZ vs SK marketing, or per-brand in
            an agency.
          </p>
        </div>
        <Link
          href="/settings/team/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          New team
        </Link>
      </header>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No teams yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              By default everyone shares one workspace. Teams add scoping.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {teams.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-secondary-900">{t.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-secondary-500">{t.slug}</p>
                      {t.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-secondary-600">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    {t.memberCount != null ? (
                      <Badge variant="default">
                        {t.memberCount} member{t.memberCount === 1 ? '' : 's'}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-4 text-xs text-secondary-500">
                    Created {new Date(t.createdAt).toLocaleDateString('cs-CZ')}
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
