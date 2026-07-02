import { Rss } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface RssCampaign {
  id: string;
  name: string;
  feedUrl: string;
  frequency: string;
  active: boolean;
  lastSentAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function RssCampaignsPage() {
  const campaigns = await apiFetch<RssCampaign[]>('/api/v1/rss-campaigns', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">RSS campaigns</h1>
        <p className="mt-1 text-sm text-secondary-500">
          Auto-send a digest whenever your feed publishes new items.
        </p>
      </header>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Rss className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No RSS campaigns yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-secondary-900">{c.name}</p>
                      <p className="truncate font-mono text-xs text-secondary-500">{c.feedUrl}</p>
                    </div>
                    <Badge variant={c.active ? 'success' : 'default'}>
                      {c.active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-secondary-500">
                    <span className="capitalize">{c.frequency}</span>
                    <span>
                      {c.lastSentAt
                        ? `Last sent ${new Date(c.lastSentAt).toLocaleDateString('cs-CZ')}`
                        : 'Never sent'}
                    </span>
                    {c.nextRunAt ? (
                      <span>Next {new Date(c.nextRunAt).toLocaleString('cs-CZ')}</span>
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
