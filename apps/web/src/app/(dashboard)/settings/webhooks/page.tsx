import Link from 'next/link';
import { ArrowLeft, Webhook as WebhookIcon, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { CreateWebhookButton } from './create-webhook-button';
import { WebhookActions } from './webhook-actions';

interface Webhook {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  lastDeliveryAt: string | null;
  failureCount: number;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const [hooks, events] = await Promise.all([
    apiFetch<Webhook[]>('/api/v1/webhooks', { fallback: [] }),
    apiFetch<string[]>('/api/v1/webhooks/events', { fallback: [] }),
  ]);

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
          <h1 className="text-2xl font-semibold text-secondary-900">Webhooks</h1>
          <p className="mt-1 text-sm text-secondary-500">
            Receive HTTP callbacks for events in your workspace — opens, clicks, unsubscribes,
            complaints, and more.
          </p>
        </div>
        <CreateWebhookButton supportedEvents={events} />
      </header>

      {hooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WebhookIcon className="mx-auto h-8 w-8 text-secondary-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary-900">No webhooks yet</p>
            <p className="mt-1 text-sm text-secondary-500">
              Create one to stream events into your data warehouse, CRM, or internal Slack.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {hooks.map((h) => (
            <li key={h.id}>
              <Card>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-secondary-400" />
                        <code className="truncate font-mono text-sm text-secondary-900">
                          {h.url}
                        </code>
                        <Badge variant={h.active ? 'success' : 'default'}>
                          {h.active ? 'Active' : 'Paused'}
                        </Badge>
                        {h.failureCount > 0 ? (
                          <Badge variant="danger">{h.failureCount} failures</Badge>
                        ) : null}
                      </div>
                      {h.description ? (
                        <p className="mt-1 text-sm text-secondary-600">{h.description}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {h.events.slice(0, 8).map((ev) => (
                          <Badge key={ev} variant="default">
                            {ev}
                          </Badge>
                        ))}
                        {h.events.length > 8 ? (
                          <span className="text-xs text-secondary-400">
                            +{h.events.length - 8} more
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-xs text-secondary-500">
                        {h.lastDeliveryAt
                          ? `Last delivery ${new Date(h.lastDeliveryAt).toLocaleString('cs-CZ')}`
                          : `Created ${new Date(h.createdAt).toLocaleString('cs-CZ')}`}
                      </p>
                    </div>
                    <WebhookActions id={h.id} url={h.url} active={h.active} />
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
