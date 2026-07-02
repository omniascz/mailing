import { MonitorSmartphone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface SiteMessage {
  id: string;
  name: string;
  type: string;
  trigger: string;
  headline: string | null;
  active: boolean;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function SiteMessagesPage() {
  const messages = await apiFetch<SiteMessage[]>('/api/v1/site-messages', { fallback: [] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-secondary-900">Site messages</h1>
        <p className="mt-1 text-sm text-secondary-500">
          On-site banners, modals and slide-outs shown to visitors based on behaviour.
        </p>
      </header>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MonitorSmartphone className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No site messages yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {messages.map((m) => (
            <li key={m.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-medium text-secondary-900">{m.name}</p>
                    <Badge variant={m.active ? 'success' : 'default'}>
                      {m.active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  {m.headline ? (
                    <p className="mt-1 line-clamp-2 text-xs text-secondary-500">{m.headline}</p>
                  ) : null}
                  <div className="mt-3 flex gap-1">
                    <Badge variant="primary">{m.type}</Badge>
                    <Badge variant="default">{m.trigger}</Badge>
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
