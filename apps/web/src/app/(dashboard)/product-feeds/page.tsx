import { Rss } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface ProductFeed {
  id: string;
  name: string;
  format: string;
  url: string;
  pollIntervalMinutes: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastItemCount: number | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function ProductFeedsPage() {
  const feeds = await apiFetch<ProductFeed[]>('/api/v1/product-feeds', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Product feeds</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Import product catalogs (XML/CSV/Heureka/Google Shopping) to power recommendations and
          product blocks.
        </p>
      </header>

      {feeds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Rss className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No product feeds yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {feeds.map((f) => (
            <li key={f.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-secondary-900">{f.name}</p>
                      <p className="truncate font-mono text-xs text-secondary-500">{f.url}</p>
                    </div>
                    <Badge variant={f.lastError ? 'danger' : 'primary'}>{f.format}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-secondary-500">
                    {f.lastItemCount != null ? (
                      <span>
                        <span className="font-semibold tabular-nums text-secondary-900">
                          {f.lastItemCount.toLocaleString('cs-CZ')}
                        </span>{' '}
                        items
                      </span>
                    ) : null}
                    <span>
                      {f.lastSyncedAt
                        ? `Synced ${new Date(f.lastSyncedAt).toLocaleString('cs-CZ')}`
                        : 'Never synced'}
                    </span>
                    {f.lastError ? (
                      <span className="text-rose-600">Error: {f.lastError.slice(0, 80)}</span>
                    ) : null}
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
