import Link from 'next/link';
import { Inbox, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { NewListButton } from './new-list-button';

interface List {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  liveContactCount: number;
  doubleOptIn: number;
  thankYouUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const dynamic = 'force-dynamic';

export default async function ListsPage() {
  const lists = await apiFetch<List[]>('/api/v1/lists', { fallback: [] });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900">Lists</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Audience containers for campaigns and workflows. Add contacts manually or capture via
            signup forms with double opt-in.
          </p>
        </div>
        <NewListButton />
      </header>

      {lists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No lists yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create your first list to start grouping subscribers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {lists.map((l) => (
            <li key={l.id}>
              <Link href={`/lists/${l.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-secondary-50">
                  <CardContent>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-secondary-900">{l.name}</p>
                        {l.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-secondary-500">
                            {l.description}
                          </p>
                        ) : null}
                      </div>
                      {l.doubleOptIn ? (
                        <Badge variant="primary">
                          <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                          DOI
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-2xl font-semibold tabular-nums text-secondary-900">
                          {l.liveContactCount.toLocaleString('cs-CZ')}
                        </p>
                        <p className="text-xs text-secondary-500">active subscribers</p>
                      </div>
                      <p className="text-xs text-secondary-500">
                        Created {new Date(l.createdAt).toLocaleDateString('cs-CZ')}
                      </p>
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
